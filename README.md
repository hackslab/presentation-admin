# Telegram Bot Admin Panel

Simple Next.js admin interface for the companion NestJS Telegram bot.

## Features

- overview counters (users, activity, job statuses)
- searchable user list with usage summary
- recent presentation jobs with pending -> failed action
- broadcast messaging to all registered users

## Environment variables

Copy `.env.example` to `.env.local` and configure values:

```env
BOT_API_URL=http://localhost:3000
```

- `BOT_API_URL`: base URL of the Telegram bot backend

## Run

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.
