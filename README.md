# 🏖 Vacay Hub - Urlaubsverwaltung SaaS

Vollständige Urlaubsverwaltung für kleine und mittlere Unternehmen.

## ✨ Features

### Für Administratoren
- ✅ Firma registrieren und eindeutigen Zugangscode erhalten
- ✅ Mitarbeiter verwalten (Rollen zuweisen, aktivieren/deaktivieren)
- ✅ Firmeneinstellungen konfigurieren
- ✅ Vollzugriff auf alle Daten

### Für Manager
- ✅ Urlaubsanträge genehmigen/ablehnen
- ✅ Urlaubstage pro Mitarbeiter festlegen
- ✅ Team-Übersicht und Statistiken
- ✅ Mitarbeiterverwaltung

### Für Mitarbeiter
- ✅ Urlaub beantragen
- ✅ Verfügbare Urlaubstage einsehen
- ✅ Status der eigenen Anträge verfolgen
- ✅ Team-Kalender einsehen

## 🚀 Deployment auf Railway

### Schritt 1: Repository erstellen

```bash
# Erstelle ein neues Verzeichnis
mkdir vacay-hub
cd vacay-hub

# Initialisiere Git
git init

# Füge alle Dateien hinzu
# - server.js
# - package.json
# - public/index.html
git add .
git commit -m "Initial commit"

# Erstelle ein GitHub Repository und pushe den Code
git remote add origin https://github.com/YOUR_USERNAME/vacay-hub.git
git push -u origin main
```

### Schritt 2: Railway Setup

1. Gehe zu [Railway.app](https://railway.app) und melde dich an
2. Klicke auf "New Project"
3. Wähle "Deploy from GitHub repo"
4. Wähle dein `vacay-hub` Repository
5. Railway erkennt automatisch Node.js

### Schritt 3: PostgreSQL Datenbank hinzufügen

1. In deinem Railway Projekt, klicke auf "New Service"
2. Wähle "Database" → "Add PostgreSQL"
3. Railway erstellt automatisch eine PostgreSQL Instanz

### Schritt 4: Umgebungsvariablen konfigurieren

Klicke auf deinen App-Service und füge folgende Variablen hinzu:

```env
DATABASE_URL=${{Postgres.DATABASE_URL}}
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
NODE_ENV=production
PORT=3000
```

**Wichtig:** `DATABASE_URL` wird automatisch von Railway bereitgestellt!

### Schritt 5: Deploy

Railway deployed automatisch bei jedem Push zu GitHub!

```bash
# Nach Änderungen:
git add .
git commit -m "Update"
git push
```

## 📁 Projektstruktur

```
vacay-hub/
├── server.js           # Express Backend Server
├── package.json        # Node.js Dependencies
├── public/
│   └── index.html     # Frontend Application
├── .env.example       # Environment Variables Template
└── README.md          # Diese Datei
```

## 🔧 Lokale Entwicklung

### Voraussetzungen

- Node.js 18+
- PostgreSQL

### Installation

```bash
# Dependencies installieren
npm install

# PostgreSQL lokal einrichten
# Erstelle eine Datenbank namens 'vacayhub'

# .env Datei erstellen
cp .env.example .env
# Bearbeite .env mit deinen lokalen Datenbank-Credentials
```

### Starten

```bash
# Entwicklungsserver
npm run dev

# Oder Produktionsserver
npm start
```

Öffne http://localhost:3000

## 🔐 Erste Schritte nach dem Deployment

### Als Admin (Firmengründer):

1. Registriere deine Firma
2. Erhalte den Zugangscode (z.B. `VC-ABC123XYZ`)
3. Teile den Code mit deinen Mitarbeitern

### Als Mitarbeiter/Manager:

1. Registriere dich mit dem Firmenzugangscode
2. Wähle deine Rolle (Mitarbeiter oder Manager)
3. Melde dich an und nutze die App

## 🛠 Technologie-Stack

- **Frontend:** Vanilla JavaScript, HTML5, CSS3
- **Backend:** Node.js, Express.js
- **Datenbank:** PostgreSQL
- **Auth:** JWT (JSON Web Tokens)
- **Hosting:** Railway
- **Password Hashing:** bcryptjs

## 📊 Datenbank-Schema

### Companies
- id, name, access_code, plan, work_days, vacation_days

### Users
- id, name, email, password_hash, role, company_id, vacation_days_total, vacation_days_used

### Vacation_Requests
- id, user_id, start_date, end_date, days_count, status, note, manager_id

### Notifications
- id, user_id, message, type, read

## 🔒 Sicherheit

- Passwörter werden mit bcrypt gehasht
- JWT für sichere Authentifizierung
- Rollenbasierte Zugriffskontrolle (RBAC)
- Umgebungsvariablen für sensible Daten

## 📝 Environment Variables (.env.example)

```env
# Database
DATABASE_URL=postgresql://user:password@localhost/vacayhub

# JWT Secret (ändern in Produktion!)
JWT_SECRET=your-secret-key-here-change-in-production

# Environment
NODE_ENV=development

# Port
PORT=3000
```

## 🚨 Wichtige Hinweise

1. **JWT_SECRET**: Unbedingt in Produktion ändern!
2. **DATABASE_URL**: Wird von Railway automatisch bereitgestellt
3. **SSL**: Railway handhabt SSL automatisch
4. **Backups**: Aktiviere automatische Backups in Railway

## 📈 Zukünftige Features

- [ ] E-Mail-Benachrichtigungen
- [ ] Feiertags-Kalender Integration
- [ ] Export zu CSV/PDF
- [ ] Stripe Payment Integration
- [ ] Mobile App
- [ ] Slack/Teams Integration
- [ ] Mehrsprachigkeit

## 📞 Support

Bei Fragen oder Problemen, erstelle ein Issue auf GitHub.

## 📄 Lizenz

MIT License - siehe LICENSE Datei

---

**Made with ❤️ by Vacay Hub Team**
