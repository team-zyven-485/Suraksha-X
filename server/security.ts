/**
 * Session tokens, access-code checks, and in-memory rate limiting.
 * No third-party deps: Node's crypto is enough for HMAC-signed tokens.
 */
import crypto from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import type { UserRole } from '../src/types/sos';

export interface SessionClaims {
  sub: string;
  role: UserRole;
  name: string;
  teamId: string | null;
  exp: number; // epoch seconds
}

const isProd = process.env.NODE_ENV === 'production';

let secret = process.env.SESSION_SECRET?.trim() || '';
if (!secret) {
  secret = crypto.randomBytes(32).toString('hex');
  console.warn('[SECURITY] SESSION_SECRET is not set — using a random one. Everyone is signed out on every restart.');
}
if (isProd && secret.length < 32) {
  console.warn('[SECURITY] SESSION_SECRET should be at least 32 characters in production.');
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString('base64url');
}

function sign(payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('base64url');
}

export function issueToken(claims: Omit<SessionClaims, 'exp'>, ttlSeconds: number): string {
  const body: SessionClaims = { ...claims, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const payload = b64url(JSON.stringify(body));
  return `${payload}.${sign(payload)}`;
}

export function verifyToken(token: string | undefined): SessionClaims | null {
  if (!token) return null;
  const [payload, sig] = token.split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionClaims;
    if (typeof claims.exp !== 'number' || claims.exp < Date.now() / 1000) return null;
    return claims;
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Access codes for the privileged roles. Configure ADMIN_ACCESS_CODE and
// RESCUE_ACCESS_CODE in .env. If one is missing we generate a random code and
// print it to the server console, so a deployment can never silently fall back
// to "anyone can be Admin".
// ---------------------------------------------------------------------------
function loadCode(envName: string, label: string): string {
  const configured = process.env[envName]?.trim();
  if (configured) return configured;
  const generated = crypto.randomBytes(4).toString('hex').toUpperCase();
  console.warn(`[SECURITY] ${envName} is not set. Temporary ${label} access code for this run: ${generated}`);
  return generated;
}

const accessCodes: Record<'admin' | 'rescue', string> = {
  admin: loadCode('ADMIN_ACCESS_CODE', 'Admin'),
  rescue: loadCode('RESCUE_ACCESS_CODE', 'Rescue Team'),
};

export function checkAccessCode(role: 'admin' | 'rescue', supplied: unknown): boolean {
  if (typeof supplied !== 'string' || supplied.length === 0 || supplied.length > 128) return false;
  // Hash both sides so the comparison is constant-length and constant-time.
  const h = (s: string) => crypto.createHash('sha256').update(s).digest();
  return crypto.timingSafeEqual(h(supplied.trim()), h(accessCodes[role]));
}

// ---------------------------------------------------------------------------
// Auth middleware
// ---------------------------------------------------------------------------
declare module 'express-serve-static-core' {
  interface Request {
    session?: SessionClaims;
  }
}

export function attachSession(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  const token = header && header.startsWith('Bearer ') ? header.slice(7) : undefined;
  req.session = verifyToken(token) ?? undefined;
  next();
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.session) return res.status(401).json({ error: 'Sign in required' });
    if (roles.length > 0 && !roles.includes(req.session.role)) {
      return res.status(403).json({ error: 'Your role is not allowed to do this' });
    }
    next();
  };
}

// ---------------------------------------------------------------------------
// Rate limiting — sliding window per client key, with periodic cleanup so the
// map cannot grow without bound.
// ---------------------------------------------------------------------------
export function rateLimit(opts: { windowMs: number; max: number; message?: string; keyPrefix?: string }) {
  const hits = new Map<string, number[]>();
  const sweep = setInterval(() => {
    const cutoff = Date.now() - opts.windowMs;
    for (const [key, stamps] of hits) {
      const live = stamps.filter((t) => t > cutoff);
      if (live.length === 0) hits.delete(key);
      else hits.set(key, live);
    }
  }, Math.max(opts.windowMs, 30_000));
  sweep.unref();

  return (req: Request, res: Response, next: NextFunction) => {
    const key = `${opts.keyPrefix ?? ''}${req.ip || req.socket.remoteAddress || 'unknown'}`;
    const now = Date.now();
    const live = (hits.get(key) || []).filter((t) => now - t < opts.windowMs);
    if (live.length >= opts.max) {
      hits.set(key, live);
      res.setHeader('Retry-After', String(Math.ceil(opts.windowMs / 1000)));
      return res.status(429).json({ error: opts.message ?? 'Too many requests — please slow down.' });
    }
    live.push(now);
    hits.set(key, live);
    next();
  };
}

export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
  res.removeHeader('X-Powered-By');
  next();
}
