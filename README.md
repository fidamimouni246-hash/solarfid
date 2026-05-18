# ☀️ SolarFid — Guide de démarrage

## Structure du projet

```
solarfid/
├── server.js       ← Le serveur Node.js (à lancer une fois)
├── index.html      ← L'application (clients + admin)
├── database.json   ← Créé automatiquement au premier lancement
└── README.md
```

---

## 🚀 Démarrage en 3 étapes

### Étape 1 — Ouvrir le terminal dans VS Code
`Terminal → Nouveau terminal`

### Étape 2 — Lancer le serveur
```bash
node server.js
```
Vous devez voir :
```
╔══════════════════════════════════════╗
║   ☀️  SolarFid — Serveur démarré      ║
║   http://localhost:3000              ║
╚══════════════════════════════════════╝
```

### Étape 3 — Ouvrir l'application
Ouvrez votre navigateur sur : **http://localhost:3000**

> ⚠️ Ne pas ouvrir index.html directement (double-clic).
> Toujours passer par http://localhost:3000

---

## 📱 Partager le formulaire à vos clients

Pour que vos clients puissent s'inscrire depuis leur téléphone :

1. Trouvez votre adresse IP locale (dans le terminal) :
   - Windows : `ipconfig` → cherchez "Adresse IPv4"
   - Mac/Linux : `ifconfig` ou `hostname -I`

2. Donnez ce lien à vos clients (remplacez XX par votre IP) :
   `http://192.168.XX.XX:3000`

> Les clients et vous devez être sur le **même réseau WiFi**.

---

## 🔐 Accès Admin

- URL : http://localhost:3000 → bouton "Admin"
- PIN par défaut : **1234**

---

## 💾 Base de données

Toutes les données sont sauvegardées dans `database.json`.
Ce fichier est créé automatiquement. Ne le supprimez pas.
