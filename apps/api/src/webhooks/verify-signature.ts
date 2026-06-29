import { createHmac, timingSafeEqual } from 'crypto';

/**
 * Verifies a GitHub webhook signature (`X-Hub-Signature-256`) against the raw
 * request body using HMAC-SHA256 and a constant-time comparison.
 *
 * Returns false (never throws) for missing, malformed, or mismatched
 * signatures, so callers can reject forged or replayed requests with a 401.
 */
export function verifySignature(
  rawBody: Buffer,
  signatureHeader: string | undefined,
  secret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith('sha256=')) {
    return false;
  }
  const expected =
    'sha256=' + createHmac('sha256', secret).update(rawBody).digest('hex');

  const received = Buffer.from(signatureHeader);
  const computed = Buffer.from(expected);
  if (received.length !== computed.length) {
    return false;
  }
  return timingSafeEqual(received, computed);
}
