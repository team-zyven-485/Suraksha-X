import { test } from 'node:test';
import assert from 'node:assert/strict';

process.env.ADMIN_ACCESS_CODE = 'unit-test-admin-code';
process.env.RESCUE_ACCESS_CODE = 'unit-test-rescue-code';
process.env.SESSION_SECRET = 'unit-test-secret-unit-test-secret-1234';

const { issueToken, verifyToken, checkAccessCode, rateLimit } = await import('../server/security');

const claims = { sub: 'cit-1', role: 'citizen' as const, name: 'Test', teamId: null };

test('token round-trips and carries its claims', () => {
  const t = issueToken(claims, 60);
  const v = verifyToken(t);
  assert.equal(v?.sub, 'cit-1');
  assert.equal(v?.role, 'citizen');
});

test('a tampered payload or signature is rejected', () => {
  const t = issueToken(claims, 60);
  const [payload, sig] = t.split('.');
  const forged = Buffer.from(JSON.stringify({ ...claims, role: 'admin', exp: 9999999999 })).toString('base64url');
  assert.equal(verifyToken(`${forged}.${sig}`), null);
  assert.equal(verifyToken(`${payload}.${sig.slice(0, -2)}AA`), null);
  assert.equal(verifyToken(`${payload}`), null);
  assert.equal(verifyToken('garbage'), null);
  assert.equal(verifyToken(undefined), null);
});

test('an expired token is rejected', () => {
  assert.equal(verifyToken(issueToken(claims, -5)), null);
});

test('access codes: right code passes, everything else fails', () => {
  assert.equal(checkAccessCode('admin', 'unit-test-admin-code'), true);
  assert.equal(checkAccessCode('admin', '  unit-test-admin-code  '), true); // trimmed
  assert.equal(checkAccessCode('admin', 'unit-test-rescue-code'), false); // other role's code
  assert.equal(checkAccessCode('rescue', 'unit-test-rescue-code'), true);
  assert.equal(checkAccessCode('admin', ''), false);
  assert.equal(checkAccessCode('admin', undefined), false);
  assert.equal(checkAccessCode('admin', 12345 as any), false);
  assert.equal(checkAccessCode('admin', 'x'.repeat(500)), false);
});

test('rateLimit blocks after max requests and reports Retry-After', () => {
  const limiter = rateLimit({ windowMs: 60_000, max: 2, keyPrefix: 'unit:' });
  const mk = () => {
    const res: any = {
      headers: {} as Record<string, string>,
      code: 200,
      body: null as any,
      setHeader(k: string, v: string) {
        this.headers[k] = v;
      },
      status(c: number) {
        this.code = c;
        return this;
      },
      json(b: any) {
        this.body = b;
        return this;
      },
    };
    return res;
  };
  const req: any = { ip: '9.9.9.9', socket: {} };
  let passed = 0;
  const next = () => passed++;
  limiter(req, mk(), next);
  limiter(req, mk(), next);
  const blocked = mk();
  limiter(req, blocked, next);
  assert.equal(passed, 2);
  assert.equal(blocked.code, 429);
  assert.ok(blocked.headers['Retry-After']);
  // A different client is not affected.
  limiter({ ip: '8.8.4.4', socket: {} } as any, mk(), next);
  assert.equal(passed, 3);
});
