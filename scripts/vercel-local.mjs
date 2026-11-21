/**
 * Runs the Vercel function bundle (api/index.js) behind a plain HTTP server, with VERCEL=1,
 * to check it before deploying:  npm run build:api && node scripts/vercel-local.mjs
 * Then in another terminal:       PORT=3300 npm run test:api
 */
import http from 'node:http';

process.env.VERCEL = process.env.VERCEL || '1';
const { default: handler } = await import('../api/index.js');
const port = Number(process.env.PORT) || 3300;
http.createServer((req, res) => handler(req, res)).listen(port, () => console.log(`[vercel-local] function on http://127.0.0.1:${port}`));
