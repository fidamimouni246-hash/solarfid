// ════════════════════════════════════════════════
//  SolarFid — Serveur Node.js
//  Lancer : node server.js
//  Accès client : http://localhost:3000
//  Accès admin  : http://localhost:3000  → bouton Admin
// ════════════════════════════════════════════════

const http = require('http');
const fs   = require('fs');
const path = require('path');
const url  = require('url');

const PORT    = 3000;
const DB_FILE = path.join(__dirname, 'database.json');

// ── Initialiser la base de données ──────────────
function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
    }
  } catch (e) { console.error('Erreur lecture DB:', e); }
  return { clients: [], admin_pin: '1234' };
}

function saveDB(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('Erreur sauvegarde DB:', e);
    return false;
  }
}

// Créer la DB si elle n'existe pas
if (!fs.existsSync(DB_FILE)) {
  saveDB({ clients: [], admin_pin: '1234' });
  console.log('Base de données créée : database.json');
}

// ── Helpers ─────────────────────────────────────
function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => body += chunk);
    req.on('end', () => {
      try { resolve(JSON.parse(body)); }
      catch (e) { resolve({}); }
    });
  });
}

function json(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Pin'
  });
  res.end(JSON.stringify(data));
}

function genCode(clients) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do {
    code = 'SVF-';
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  } while (clients.find(c => c.code === code));
  return code;
}

function checkAdmin(req) {
  const db = loadDB();
  return req.headers['x-admin-pin'] === db.admin_pin;
}

// ── Serveur HTTP ─────────────────────────────────
const server = http.createServer(async (req, res) => {
  const parsed  = url.parse(req.url, true);
  const pathname = parsed.pathname;
  const method   = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Admin-Pin'
    });
    return res.end();
  }

  // ── Servir index.html ──
  if (pathname === '/' || pathname === '/index.html') {
    const file = path.join(__dirname, 'index.html');
    if (fs.existsSync(file)) {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(fs.readFileSync(file));
    }
    return json(res, { error: 'index.html introuvable' }, 404);
  }

  // ═══════════════════════════════════════════════
  //  API CLIENTS
  // ═══════════════════════════════════════════════

  // GET /api/clients — liste tous les clients (admin)
  if (pathname === '/api/clients' && method === 'GET') {
    if (!checkAdmin(req)) return json(res, { error: 'Non autorisé' }, 401);
    const db = loadDB();
    return json(res, db.clients);
  }

  // POST /api/clients/register — inscription nouveau client
  if (pathname === '/api/clients/register' && method === 'POST') {
    const body = await readBody(req);
    const { name, phone, email, city, refCode } = body;

    if (!name || !phone) return json(res, { error: 'Nom et téléphone requis' }, 400);

    const db = loadDB();
    const phoneClean = phone.replace(/\s/g, '');

    if (db.clients.find(c => c.phone === phoneClean))
      return json(res, { error: 'Ce numéro est déjà inscrit' }, 409);

    // Vérifier code parrainage
    let refParent = null;
    if (refCode) {
      refParent = db.clients.find(c => c.code === refCode.toUpperCase());
      if (!refParent) return json(res, { error: 'Code de parrainage invalide' }, 400);
    }

    const now = new Date();
    const dateStr = now.toLocaleDateString('fr-FR');
    const client = {
      id:          Date.now(),
      name:        name.trim(),
      phone:       phoneClean,
      email:       (email || '').trim(),
      city:        city || '',
      code:        genCode(db.clients),
      kw:          0,
      referrals:   0,
      panelsEarned:0,
      panelsUsed:  0,
      history:     [{ type: 'inscription', label: 'Inscription au programme', date: dateStr, pts: '' }],
      createdAt:   now.toISOString()
    };

    db.clients.push(client);

    // Créditer le parrain
    if (refParent) {
      const idx = db.clients.findIndex(c => c.phone === refParent.phone);
      db.clients[idx].referrals     += 1;
      db.clients[idx].panelsEarned  += 1;
      db.clients[idx].history.unshift({
        type: 'parrainage', label: `Parrainage : ${client.name}`,
        date: dateStr, pts: '+1 panneau'
      });
    }

    saveDB(db);
    console.log(`[${dateStr}] Nouveau client : ${client.name} (${client.phone})`);
    return json(res, client, 201);
  }

  // GET /api/clients/:phone — accéder à sa carte
  if (pathname.startsWith('/api/clients/') && method === 'GET') {
    const phone = decodeURIComponent(pathname.split('/')[3]);
    const db = loadDB();
    const client = db.clients.find(c => c.phone === phone.replace(/\s/g, ''));
    if (!client) return json(res, { error: 'Client non trouvé' }, 404);
    return json(res, client);
  }

  // PUT /api/clients/:phone/kw — ajouter kWc (admin)
  if (pathname.match(/^\/api\/clients\/.+\/kw$/) && method === 'PUT') {
    if (!checkAdmin(req)) return json(res, { error: 'Non autorisé' }, 401);
    const phone = decodeURIComponent(pathname.split('/')[3]);
    const body  = await readBody(req);
    const val   = parseFloat(body.value);
    if (isNaN(val) || val <= 0) return json(res, { error: 'Valeur invalide' }, 400);

    const db  = loadDB();
    const idx = db.clients.findIndex(c => c.phone === phone);
    if (idx < 0) return json(res, { error: 'Client non trouvé' }, 404);

    const panels = Math.floor((db.clients[idx].kw + val) / 2) - Math.floor(db.clients[idx].kw / 2);
    db.clients[idx].kw = Math.round((db.clients[idx].kw + val) * 10) / 10;
    db.clients[idx].panelsEarned += panels;
    db.clients[idx].history.unshift({
      type: 'kw', label: body.note || `Installation +${val} kWc`,
      date: new Date().toLocaleDateString('fr-FR'),
      pts: panels > 0 ? `+${panels} panneau${panels > 1 ? 'x' : ''}` : 'kWc ajoutés'
    });
    saveDB(db);
    return json(res, db.clients[idx]);
  }

  // PUT /api/clients/:phone/referral — valider parrainage (admin)
  if (pathname.match(/^\/api\/clients\/.+\/referral$/) && method === 'PUT') {
    if (!checkAdmin(req)) return json(res, { error: 'Non autorisé' }, 401);
    const phone = decodeURIComponent(pathname.split('/')[3]);
    const body  = await readBody(req);
    const db    = loadDB();
    const idx   = db.clients.findIndex(c => c.phone === phone);
    if (idx < 0) return json(res, { error: 'Client non trouvé' }, 404);

    db.clients[idx].referrals    += 1;
    db.clients[idx].panelsEarned += 1;
    db.clients[idx].history.unshift({
      type: 'parrainage', label: body.note || 'Parrainage validé par admin',
      date: new Date().toLocaleDateString('fr-FR'), pts: '+1 panneau'
    });
    saveDB(db);
    return json(res, db.clients[idx]);
  }

  // PUT /api/clients/:phone/reward — utiliser une récompense (admin)
  if (pathname.match(/^\/api\/clients\/.+\/reward$/) && method === 'PUT') {
    if (!checkAdmin(req)) return json(res, { error: 'Non autorisé' }, 401);
    const phone = decodeURIComponent(pathname.split('/')[3]);
    const body  = await readBody(req);
    const db    = loadDB();
    const idx   = db.clients.findIndex(c => c.phone === phone);
    if (idx < 0) return json(res, { error: 'Client non trouvé' }, 404);
    if (db.clients[idx].panelsEarned <= db.clients[idx].panelsUsed)
      return json(res, { error: 'Aucune récompense disponible' }, 400);

    db.clients[idx].panelsUsed += 1;
    db.clients[idx].history.unshift({
      type: 'reward', label: body.note || 'Récompense utilisée',
      date: new Date().toLocaleDateString('fr-FR'), pts: '-1 panneau'
    });
    saveDB(db);
    return json(res, db.clients[idx]);
  }

  // DELETE /api/clients/:phone — supprimer client (admin)
  if (pathname.startsWith('/api/clients/') && method === 'DELETE') {
    if (!checkAdmin(req)) return json(res, { error: 'Non autorisé' }, 401);
    const phone = decodeURIComponent(pathname.split('/')[3]);
    const db    = loadDB();
    const before = db.clients.length;
    db.clients   = db.clients.filter(c => c.phone !== phone);
    if (db.clients.length === before) return json(res, { error: 'Client non trouvé' }, 404);
    saveDB(db);
    return json(res, { ok: true });
  }

  // POST /api/admin/login — vérifier PIN admin
  if (pathname === '/api/admin/login' && method === 'POST') {
    const body = await readBody(req);
    const db   = loadDB();
    if (body.pin === db.admin_pin) return json(res, { ok: true });
    return json(res, { error: 'PIN incorrect' }, 401);
  }

  // GET /api/stats — statistiques (admin)
  if (pathname === '/api/stats' && method === 'GET') {
    if (!checkAdmin(req)) return json(res, { error: 'Non autorisé' }, 401);
    const db = loadDB();
    return json(res, {
      total:      db.clients.length,
      totalKw:    db.clients.reduce((s, c) => s + c.kw, 0),
      totalRefs:  db.clients.reduce((s, c) => s + c.referrals, 0),
      totalPanels:db.clients.reduce((s, c) => s + c.panelsEarned, 0)
    });
  }

  // Route non trouvée
  json(res, { error: 'Route non trouvée' }, 404);
});

server.listen(PORT, () => {
  console.log('');
  console.log('╔══════════════════════════════════════╗');
  console.log('║   ☀️  SolarFid — Serveur démarré      ║');
  console.log('╠══════════════════════════════════════╣');
  console.log(`║   http://localhost:${PORT}              ║`);
  console.log('║   Base : database.json               ║');
  console.log('║   PIN admin par défaut : 1234        ║');
  console.log('╚══════════════════════════════════════╝');
  console.log('');
});
