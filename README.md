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
| Live natural events | **Real.** Open wildfires, storms, floods, volcanoes etc. worldwide from NASA EONET (no key), listed nearest-first with distance and plotted on the map. |
| NASA satellite imagery overlay | **Real.** Daily MODIS true-color, MODIS flood/water (bands 7-2-1) and IMERG rainfall layers from NASA GIBS on the Command Center map. Imagery is global and a day old; it is a visual aid, not an automated flood detector. |
| AI hazard simulation | **Pure simulation, labelled as such** (no real-time sensor, satellite, weather or terrain data). For any incident (flood, landslide, tsunami, cyclone, earthquake, fire) it draws an illustrative nested footprint with emoji markers and a time slider on the map. **Gemini only proposes bounded parameters** (direction, extent, intensity, assumptions, a few markers); our own code validates and clamps them and draws the geometry, so the model never draws coordinates. Works without Gemini (rule-based sketch, also on-device offline). Staff also get a simulated exposure estimate (sample zones/shelters inside the footprint). Citizens get fixed, vetted safety reminders, never AI-written instructions. |
| Live rescue-team tracking | **Real.** A rescue phone shares its GPS (browser Geolocation) every few seconds; the admin sees all teams on a live map and the assigned citizen sees only their own team moving toward them, with a live ETA. Privacy is enforced server-side. For single-laptop demos there is a **Demo drive** button: it drives a simulated team along a real road route, and every screen labels it "simulated GPS". |
| Road routing | **Real.** Routes, distance, time and turn-by-turn directions come from OpenStreetMap (OSRM) and replace straight-line estimates. OSRM knows roads and typical speeds only — **not** floods or blocked roads — and the UI says so. Needs internet; falls back to a labelled straight-line estimate offline. |
| Risk / priority scoring, team recommendation | **Rule-based formulas** over scenario data (distance, zone risk level, specialization). Not a trained ML model. |
| Hazard scenarios (flood, earthquake, cyclone, landslide, tsunami) | **Bundled sample data** for 5 regions — not live feeds. |
| Satellite Intelligence | Sentinel-1 via Copernicus when credentials are set; otherwise clearly labelled **DEMO DATA**. |
| Live traffic, IoT river sensors | **Not implemented.** Road routing uses typical speeds, not live traffic. |
| CAP broadcast | **Simulation.** Generates a CAP XML alert (status `Exercise`) and logs it. The UI is labelled as a simulation; it does **not** connect to any SMS / radio / siren / WhatsApp service. |

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
npm test            # 36 unit tests: triage rules, session tokens, access codes, rate limiting, store invariants, routing geometry, hazard simulation
npm run dev         # in one terminal
npm run test:api    # in another: 80 end-to-end API checks (auth, roles, ownership, lifecycle, cancel/close, live-location privacy, routing, rate limits)
```

`test:api` creates real incidents in whatever database the server uses — use a throwaway one
(e.g. start the server with `MONGODB_DB=suraksha_test`). It passes identically on the in-memory
store and on MongoDB. GitHub Actions (`.github/workflows/ci.yml`) runs type-check, unit tests,
build and the API tests on every push.

## Production

```bash
npm run build
npm start           # one Node process serves the frontend and /api
```

Deploy to a host that runs a persistent Node process (Render, Railway, a VM). Set the same
environment variables in the host's dashboard, plus `NODE_ENV=production` and `TRUST_PROXY=1`
when behind the host's proxy. Offline support requires HTTPS (or localhost).

## Which Gemini models are used

Probed against a **free-tier** key: the Pro models (`gemini-3.1-pro-preview`, `gemini-pro-latest`) have **no free quota** (HTTP 429), and `gemini-2.5-pro` / `2.5-flash` are closed to new keys. So the app prefers the newest Flash models, in order: `3.8-flash`, `3.7-flash`, `3.6-flash`, `3.5-flash`, `3-flash-preview`, then Flash-Lite. A model that is overloaded or rate-limited sits out a short cooldown, and for the hazard simulation the next-best model is started in parallel if the first has not answered within a few seconds (first valid answer wins). With a billing-enabled key you can add a Pro model at the top of `GEMINI_MODELS` in `server/gemini.ts`.

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

## License

MIT — see [LICENSE](LICENSE).
