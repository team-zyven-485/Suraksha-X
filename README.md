# SURAKSHA-X — Disaster Intelligence & Relocation Platform

Multi-hazard disaster response platform (SIH26191) with three role-based apps —
**Admin** command & control, **Citizen** emergency assistance, and **Rescue Team**
field coordination — plus satellite-informed hazard/route intelligence and an AI
copilot (Gemini, with a built-in rule-based fallback).

## What is real and what is simulated

| Feature | Status |
|---|---|
| SOS → triage → assignment → dispatch → rescue lifecycle | **Real.** Stored in MongoDB, enforced server-side (roles, ownership, forward-only status). |
| Role security | **Real.** Admin / Rescue need an access code; sessions are signed tokens; the server recomputes risk/priority/team for every SOS. |
| Offline SOS | **Real.** App opens offline (service worker). An SOS raised with no connection is stored on the device and sent automatically when the connection returns (idempotent — never duplicated). Limit: it needs *some* connectivity to be delivered; there is no satellite/mesh link. |
| Languages | **Real.** English, Hindi, Marathi for the Citizen app and role screen. Admin / Rescue screens, zone names and route instructions are English. |
| Live weather | **Real.** Current conditions + 3-day rain forecast from Open-Meteo (free, no key). Shows "unavailable" instead of guessing if the feed is down. |
| Risk / priority scoring, team recommendation | **Rule-based formulas** over scenario data (distance, zone risk level, specialization). Not a trained ML model. |
| Hazard scenarios (flood, earthquake, cyclone, landslide, tsunami) | **Bundled sample data** for 5 regions — not live feeds. |
| Satellite Intelligence | Sentinel-1 via Copernicus when credentials are set; otherwise clearly labelled **DEMO DATA**. |
| Live traffic, IoT river sensors | **Not implemented.** Routes are scenario data plus satellite road-risk checks. |
| CAP broadcast | Generates a CAP XML alert and logs it. It does **not** actually send SMS / radio / sirens. |

## Architecture

```
Browser (React + Vite, PWA)  ──/api──▶  Node/Express server (server.ts, server/)  ──▶  MongoDB
                                                    │
                                                    └─▶ Gemini (chat), Open-Meteo (weather)
Optional: FastAPI satellite service (backend/) ──▶ Copernicus, MongoDB
```

* `server.ts` + `server/` — API, auth, MongoDB store, rate limiting, static hosting.
* `src/shared/sosTriage.ts` — triage rules used by the server (authoritative) and the browser (instant offline assessment).
* `src/` — React app. `public/sw.js` — offline service worker (production builds only).
* `backend/` — optional FastAPI satellite service.

## Setup

Requires Node 18+ (Python 3.11+ only for the optional satellite service).

```bash
npm install
cp .env.example .env     # then edit it
npm run dev              # http://localhost:3000
```

Edit `.env`:

* `MONGODB_URI` — your MongoDB / Atlas connection string. **Empty = in-memory mode** (works, but data is lost on restart; the sidebar shows "MEMORY MODE — NOT SAVED"). If the URI is set but unreachable the server says so loudly and falls back to memory.
* `ADMIN_ACCESS_CODE`, `RESCUE_ACCESS_CODE` — codes for the two staff roles. If empty, the server generates temporary ones and prints them at startup.
* `SESSION_SECRET` — 32+ random characters (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
* `GEMINI_API_KEY` — optional.

Atlas: add your IP (or `0.0.0.0/0` for a demo) under *Network Access*, and use a database user with read/write on the database.

## Tests

```bash
npm run lint        # type-check
npm run dev         # in one terminal
npm run test:api    # in another: 45 end-to-end API checks (auth, roles, ownership, lifecycle, rate limits)
```

`test:api` creates real incidents in whatever database the server uses — use a throwaway one
(e.g. start the server with `MONGODB_DB=suraksha_test`).

## Production

```bash
npm run build
npm start           # one Node process serves the frontend and /api
```

Deploy to a host that runs a persistent Node process (Render, Railway, a VM). Set the same
environment variables in the host's dashboard, plus `NODE_ENV=production` and `TRUST_PROXY=1`
when behind the host's proxy. Offline support requires HTTPS (or localhost).

## Satellite service (optional)

```bash
cd backend
python -m venv .venv && .venv\Scripts\activate    # source .venv/bin/activate on macOS/Linux
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000
```

Leave the Copernicus credentials blank to run in DEMO DATA mode. Set `ALLOWED_ORIGINS` to your
deployed frontend URL, and `VITE_API_BASE_URL` (frontend, at build time) to the deployed service.
