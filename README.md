# Monday Racing League (MRL) Website

Next.js + Tailwind + Prisma (SQLite) mit Admin-Bereich (Login) zum Befüllen der Inhalte.

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

2. Dev Server

```bash
npm run dev
```

Admin Setup: `/admin/setup`  
Admin Login: `/admin/login`

## Railway Deployment (Kurz)

1. Neues Railway Projekt erstellen
2. (Empfohlen) Volume anlegen und auf den Web-Service mounten:
   - Mount Path: `/app/data`
3. Deploy
4. Danach einmal Admin einrichten:
   - `/admin/setup` öffnen und ersten Admin anlegen

Hinweis: Ohne Volume sind Daten nach einem Redeploy/Restart nicht dauerhaft.
