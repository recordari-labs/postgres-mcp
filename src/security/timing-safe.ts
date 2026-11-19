import { createHash, timingSafeEqual } from 'node:crypto';

export function timingSafeStringEqual(left: string, right: string): boolean {
  const a = createHash('sha256').update(left).digest();
  const b = createHash('sha256').update(right).digest();
  return timingSafeEqual(a, b);
}
