# SURAKSHA-X — Disaster Intelligence & Relocation Platform

Multi-hazard disaster response platform (SIH26191) covering Admin command &
control, Citizen emergency assistance, and Rescue Team field coordination —
with satellite-informed hazard/route intelligence and a Gemini-backed AI
copilot (falls back to a local tactical engine when no Gemini key is set).

## Architecture

This repo has three moving parts:

1. **Frontend + chat API** — React/Vite app served by an Express server
   ([server.ts](server.ts)), which also hosts `/api/chat` and `/api/health`.
   This is the only piece required to run the app.
2. **Satellite Intelligence backend** (`backend/`) — a separate FastAPI
   service providing Sentinel-1-derived hazard extent, road-risk, and
   safe-routing data. Optional: without it (or without Copernicus
   credentials configured), the Satellite Intelligence pages run in an
   honest DEMO DATA mode instead of failing.
3. **Supabase** — Postgres + RLS + Realtime, used for SOS incidents, rescue
   team coordination, and relocation plans. Optional: without it configured,
   the app runs entirely on local in-memory scenario data.

## Prerequisites

- Node.js 18+
- Python 3.11+ (only if you want to run the satellite backend locally)

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`:

- `GEMINI_API_KEY` — optional. Without a real key, the AI copilot still
  works, answering from a local tactical-intelligence engine instead of
  Gemini (the chat header honestly shows which one answered).
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — optional, see Supabase
  section below.
- `VITE_API_BASE_URL` — where the satellite backend is reachable
  (`http://localhost:8000` for local dev).

## Running locally

**Frontend + chat API** (required):

```bash
npm run dev
```

Opens at http://localhost:3000.

**Satellite Intelligence backend** (optional — only needed for live/DEMO
satellite pages; everything else works without it):

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate        # Windows; use `source .venv/bin/activate` on macOS/Linux
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Leave `COPERNICUS_CLIENT_ID`/`COPERNICUS_CLIENT_SECRET` blank in
`backend/.env` to run this service in DEMO DATA mode.

## Supabase setup (optional)

Create a project at [supabase.com](https://supabase.com), then run the
migrations in `supabase/migrations/` **in order** via the SQL Editor
(0001 → 0004). Put the project URL and anon/publishable key in the root
`.env`, and the service-role key in `backend/.env` (never in the frontend).

## Production build

```bash
npm run build
npm start
```

`npm start` runs the bundled Express server (`dist/server.cjs`) as a single
persistent Node process serving both the frontend and `/api/chat`.

## Deployment

The Node app (`npm run build` + `npm start`) is built for a host that runs a
persistent Node process — e.g. Render or Railway (import from GitHub,
build command `npm run build`, start command `npm start`, set the env vars
from `.env` in the platform's dashboard). It is **not** a serverless-shaped
app as-is, so a static-site + serverless-functions platform (Vercel,
Netlify) would need `/api/chat` and `/api/health` rewritten as individual
serverless functions first.

If you deploy the satellite backend too, remember to update `ALLOWED_ORIGINS`
in `backend/.env` to your deployed frontend's real URL, and point the
frontend's `VITE_API_BASE_URL` at the deployed backend.
