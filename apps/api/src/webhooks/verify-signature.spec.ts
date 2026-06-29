import { createHmac } from 'crypto';
import { verifySignature } from './verify-signature';

const secret = 'topsecret';
const body = Buffer.from(JSON.stringify({ hello: 'world' }));
const good = 'sha256=' + createHmac('sha256', secret).update(body).digest('hex');

describe('verifySignature', () => {
  it('accepts a valid signature', () => {
    expect(verifySignature(body, good, secret)).toBe(true);
  });

  it('rejects a tampered body', () => {
    expect(verifySignature(Buffer.from('{"hello":"evil"}'), good, secret)).toBe(
      false,
    );
  });

  it('rejects a wrong secret', () => {
    expect(verifySignature(body, good, 'other-secret')).toBe(false);
  });

  it('rejects a missing header', () => {
    expect(verifySignature(body, undefined, secret)).toBe(false);
  });

  it('rejects a malformed header', () => {
    expect(verifySignature(body, 'garbage', secret)).toBe(false);
  });

  it('rejects a sha1-style header', () => {
    expect(verifySignature(body, 'sha1=' + 'a'.repeat(40), secret)).toBe(false);
  });
});
