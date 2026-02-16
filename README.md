# Telegram Bot Admin Panel

Simple Next.js admin interface for the companion NestJS Telegram bot.

## Features

- full admin dashboard layout with navigation, KPI cards, watchlist, and queue table
- searchable user list with usage summary
- recent presentation jobs with pending -> failed action
- broadcast messaging to all registered users
- backend-driven auth via `/admin/auth/*` endpoints
- admin account management via `/admin/admins/*` endpoints (SUPERADMIN)

## Environment variables

Copy `.env.example` to `.env.local` and configure values:

```env
BOT_API_URL=http://localhost:3000
```

- `BOT_API_URL`: base URL of the Telegram bot backend
- Admin credentials and auth secret are configured in the backend service.

## Run

```bash
npm install
npm run dev
```

Then open `http://localhost:3001`.
