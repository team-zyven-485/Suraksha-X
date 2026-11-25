/**
 * Vercel serverless entry. This file is bundled (npm run build:api) into
 * api/index.js, which Vercel deploys as the /api function. The Express app is
 * built once per warm instance and reused across requests.
 */
import 'dotenv/config';
import type { IncomingMessage, ServerResponse } from 'http';
import { buildApp } from '../server/app';

let appPromise: ReturnType<typeof buildApp> | null = null;

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  try {
    appPromise ??= buildApp();
    const app = await appPromise;
    app(req as any, res as any);
  } catch (err) {
    appPromise = null; // try again on the next request (e.g. the database was briefly unreachable)
    console.error('[Vercel] startup failed:', (err as Error)?.message ?? err);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Service unavailable: the API could not start (check MONGODB_URI and other environment variables).' }));
  }
}
