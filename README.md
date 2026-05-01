# Monday Racing League (MRL) Website

Next.js + Tailwind + Prisma (PostgreSQL) mit Admin-Bereich (Login) zum Befüllen der Inhalte.

## Features

- Startseite, News, Kalender
- Ligen: MRL One / MRL Two / MRL Rookie
  - Fahrer
  - Ergebnisse
  - WM Stand (aus Ergebnissen berechnet)
  - Rennkalender
- Admin-Bereich
  - News erstellen/löschen
  - Pro Liga: Fahrer/Rennen/Ergebnisse verwalten

## Lokales Setup

1. Abhängigkeiten installieren

```bash
npm install
```

2. Umgebungsvariablen setzen (Beispiel: [.env.example](file:///Users/foto-scheiber/Desktop/test/MondayRacingLeaque/.env.example))

3. Prisma Client generieren

```bash
npx prisma generate
```

4. Datenbank Schema pushen (benötigt laufende PostgreSQL DB)

```bash
npm run prisma:push
```

5. Dev Server

```bash
npm run dev
```

Admin Login: `/admin`

## Admin Passwort Hash

```bash
node scripts/hash-admin-password.mjs "DEIN_PASSWORT"
```

Den Output als `ADMIN_PASSWORD_HASH` setzen.

## Railway Deployment (Kurz)

1. Neues Railway Projekt erstellen
2. PostgreSQL hinzufügen
3. Umgebungsvariablen setzen:
   - `DATABASE_URL` (von Railway Postgres)
   - `NEXTAUTH_URL` (deine Railway Domain)
   - `NEXTAUTH_SECRET` (random)
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD_HASH`
4. Deploy
5. Nach dem ersten Deploy einmalig Schema pushen (Railway Shell / CI Step):

```bash
npm run prisma:push
```
