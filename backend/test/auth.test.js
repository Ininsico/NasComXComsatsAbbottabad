import assert from 'node:assert/strict';
import test from 'node:test';
import jwt from 'jsonwebtoken';
import { config } from '../src/config.js';
import { hashPassword, issueToken, verifyPassword } from '../src/lib/auth.js';

test('a password round trips through the hash and never appears in it', async () => {
  const hash = await hashPassword('Student123');

  assert.notEqual(hash, 'Student123');
  assert.match(hash, /^\$2[aby]\$/);
  assert.equal(await verifyPassword('Student123', hash), true);
  assert.equal(await verifyPassword('student123', hash), false);
  assert.equal(await verifyPassword('', hash), false);
});

test('two hashes of the same password differ, because each is salted', async () => {
  const [first, second] = await Promise.all([hashPassword('SamePassword1'), hashPassword('SamePassword1')]);

  assert.notEqual(first, second);
});

test('an issued token carries the account id and role', () => {
  const token = issueToken({ id: 'user-42', role: 'admin' });
  const payload = jwt.verify(token, config.jwt.secret);

  assert.equal(payload.sub, 'user-42');
  assert.equal(payload.role, 'admin');
  assert.ok(payload.exp > payload.iat);
});

test('a token signed with a different secret is rejected', () => {
  const foreign = jwt.sign({ sub: 'user-42', role: 'admin' }, 'some-other-secret');

  assert.throws(() => jwt.verify(foreign, config.jwt.secret));
});
