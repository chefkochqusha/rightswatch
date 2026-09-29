import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { hashPassword, verifyPassword } from './password';

describe('password hashing', () => {
  test('a hashed password verifies successfully against the original', async () => {
    const hash = await hashPassword('correct horse battery staple');
    assert.equal(await verifyPassword('correct horse battery staple', hash), true);
  });

  test('the wrong password fails verification', async () => {
    const hash = await hashPassword('correct horse battery staple');
    assert.equal(await verifyPassword('wrong password', hash), false);
  });

  test('hashing the same password twice produces different strings (random salt)', async () => {
    const a = await hashPassword('same password');
    const b = await hashPassword('same password');
    assert.notEqual(a, b);
    assert.equal(await verifyPassword('same password', a), true);
    assert.equal(await verifyPassword('same password', b), true);
  });

  test('a malformed stored hash fails closed instead of throwing', async () => {
    assert.equal(await verifyPassword('anything', 'not-a-valid-hash'), false);
    assert.equal(await verifyPassword('anything', ''), false);
  });
});
