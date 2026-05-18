// ════════════════════════════════════════════════════════════
//  SolarFid — Serveur Node.js / Express
//  Compatible Railway (utilise process.env.PORT)
// ════════════════════════════════════════════════════════════
const express = require('express');
const fs      = require('fs');
const path    = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;
const ADMIN_PIN = process.env.ADMIN_PIN || '1234';

// ──────────────── Middlewares
app.use(express.json());
app.use(express.static(__dirname));   // sert index.html, css, etc.

// ──────────────── Base de données (fichier JSON)
const DB_PATH = path.join(__dirname, 'database.json');

function loadDB() {
  try {
    if (!fs.existsSync(DB_PATH)) {
      const init = { clients: [] };
      fs.writeFileSync(DB_PATH, JSON.stringify(init, null, 2));
      return init;
    }
    return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
  } catch (e) {
    console.error('Erreur lecture DB:', e);
    return { clients: [] };
  }
}

function saveDB(db) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('Erreur écriture DB:', e);
  }
}

// ──────────────── Utilitaires
function generateCode() {
  const rand = Math.floor(100000 + Math.random() * 900000);
  return 'SVF-' + rand;
}

function now() {
  return new Date().toISOString();
}

function formatDate(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function normalizePhone(p) {
  return (p || '').replace(/\s/g, '');
}

// ──────────────── Middleware Admin
function requireAdmin(req, res, next) {
  const pin = req.headers['x-admin-pin'];
  if (pin !== ADMIN_PIN) {
    return res.status(401).json({ error: 'Accès non autorisé' });
  }
  next();
}

// ════════════════════════════════════════════════════════════
//  ROUTES API
// ════════════════════════════════════════════════════════════

// Healthcheck Railway
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: now() });
});

// ──────────────── Admin login
app.post('/api/admin/login', (req, res) => {
  const { pin } = req.body;
  if (pin === ADMIN_PIN) {
    return res.json({ ok: true });
  }
  res.status(401).json({ error: 'PIN incorrect' });
});

// ──────────────── Inscription d'un client
app.post('/api/clients/register', (req, res) => {
  const { name, phone, email, city, refCode } = req.body;
  if (!name || !phone) {
    return res.status(400).json({ error: 'Nom et téléphone obligatoires' });
  }

  const db = loadDB();
  const cleanPhone = normalizePhone(phone);

  if (db.clients.find(c => normalizePhone(c.phone) === cleanPhone)) {
    return res.status(409).json({ error: 'Ce numéro est déjà inscrit. Accédez à votre carte.' });
  }

  // Code unique
  let code;
  do { code = generateCode(); } while (db.clients.find(c => c.code === code));

  const newClient = {
    name: name.trim(),
    phone: cleanPhone,
    email: (email || '').trim(),
    city: city || '',
    code,
    kw: 0,
    referrals: 0,
    panelsEarned: 0,
    panelsUsed: 0,
    referredBy: refCode || null,
    history: [{
      type: 'inscription',
      label: 'Inscription au programme',
      date: formatDate(now()),
      pts: '🎉'
    }],
    createdAt: now()
  };

  // Bonus parrainage : si refCode existe, on incrémente le parrain
  if (refCode) {
    const sponsor = db.clients.find(c => c.code === refCode.toUpperCase().trim());
    if (sponsor) {
      sponsor.referrals = (sponsor.referrals || 0) + 1;
      sponsor.panelsEarned = (sponsor.panelsEarned || 0) + 1;
      sponsor.history.unshift({
        type: 'parrainage',
        label: `Nouveau parrainage : ${newClient.name}`,
        date: formatDate(now()),
        pts: '+1 panneau'
      });
    }
  }

  db.clients.push(newClient);
  saveDB(db);

  res.json(newClient);
});

// ──────────────── Récupérer un client par téléphone
app.get('/api/clients/:phone', (req, res) => {
  const db = loadDB();
  const phone = normalizePhone(decodeURIComponent(req.params.phone));
  const client = db.clients.find(c => normalizePhone(c.phone) === phone);
  if (!client) return res.status(404).json({ error: 'Client introuvable' });
  res.json(client);
});

// ──────────────── Liste de tous les clients (admin)
app.get('/api/clients', requireAdmin, (req, res) => {
  const db = loadDB();
  // tri par date d'inscription décroissante
  const list = [...db.clients].sort((a, b) =>
    (b.createdAt || '').localeCompare(a.createdAt || '')
  );
  res.json(list);
});

// ──────────────── Statistiques globales (admin)
app.get('/api/stats', requireAdmin, (req, res) => {
  const db = loadDB();
  const total = db.clients.length;
  const totalKw = db.clients.reduce((s, c) => s + (c.kw || 0), 0);
  const totalRefs = db.clients.reduce((s, c) => s + (c.referrals || 0), 0);
  const totalPanels = db.clients.reduce((s, c) => s + (c.panelsEarned || 0), 0);
  res.json({ total, totalKw, totalRefs, totalPanels });
});

// ──────────────── Ajouter des kWc (admin)
app.put('/api/clients/:phone/kw', requireAdmin, (req, res) => {
  const { value, note } = req.body;
  if (!value || isNaN(value) || value <= 0) {
    return res.status(400).json({ error: 'Valeur kWc invalide' });
  }
  const db = loadDB();
  const phone = normalizePhone(decodeURIComponent(req.params.phone));
  const client = db.clients.find(c => normalizePhone(c.phone) === phone);
  if (!client) return res.status(404).json({ error: 'Client introuvable' });

  const oldPanels = Math.floor((client.kw || 0) / 2);
  client.kw = (client.kw || 0) + parseFloat(value);
  const newPanels = Math.floor(client.kw / 2);
  const gained = newPanels - oldPanels;
  client.panelsEarned = (client.panelsEarned || 0) + gained;

  client.history.unshift({
    type: 'kw',
    label: note || `Installation +${value} kWc`,
    date: formatDate(now()),
    pts: `+${value} kWc`
  });

  saveDB(db);
  res.json(client);
});

// ──────────────── Valider un parrainage manuel (admin)
app.put('/api/clients/:phone/referral', requireAdmin, (req, res) => {
  const { note } = req.body;
  const db = loadDB();
  const phone = normalizePhone(decodeURIComponent(req.params.phone));
  const client = db.clients.find(c => normalizePhone(c.phone) === phone);
  if (!client) return res.status(404).json({ error: 'Client introuvable' });

  client.referrals = (client.referrals || 0) + 1;
  client.panelsEarned = (client.panelsEarned || 0) + 1;

  client.history.unshift({
    type: 'parrainage',
    label: note || 'Parrainage validé manuellement',
    date: formatDate(now()),
    pts: '+1 panneau'
  });

  saveDB(db);
  res.json(client);
});

// ──────────────── Marquer une récompense comme utilisée (admin)
app.put('/api/clients/:phone/reward', requireAdmin, (req, res) => {
  const { note } = req.body;
  const db = loadDB();
  const phone = normalizePhone(decodeURIComponent(req.params.phone));
  const client = db.clients.find(c => normalizePhone(c.phone) === phone);
  if (!client) return res.status(404).json({ error: 'Client introuvable' });

  if ((client.panelsEarned || 0) - (client.panelsUsed || 0) <= 0) {
    return res.status(400).json({ error: 'Aucune récompense disponible à utiliser' });
  }

  client.panelsUsed = (client.panelsUsed || 0) + 1;

  client.history.unshift({
    type: 'reward',
    label: note || 'Récompense utilisée (panneau remis)',
    date: formatDate(now()),
    pts: '-1 panneau'
  });

  saveDB(db);
  res.json(client);
});

// ──────────────── Supprimer un client (admin)
app.delete('/api/clients/:phone', requireAdmin, (req, res) => {
  const db = loadDB();
  const phone = normalizePhone(decodeURIComponent(req.params.phone));
  const before = db.clients.length;
  db.clients = db.clients.filter(c => normalizePhone(c.phone) !== phone);
  if (db.clients.length === before) {
    return res.status(404).json({ error: 'Client introuvable' });
  }
  saveDB(db);
  res.json({ ok: true });
});

// ──────────────── Catch-all : renvoyer index.html (SPA)
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// ════════════════════════════════════════════════════════════
//  Démarrage
// ════════════════════════════════════════════════════════════
app.listen(PORT, '0.0.0.0', () => {
  console.log(`☀️ SolarFid en ligne sur le port ${PORT}`);
  console.log(`   Admin PIN : ${ADMIN_PIN}`);
});
