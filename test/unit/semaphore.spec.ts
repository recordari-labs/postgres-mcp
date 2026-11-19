import { describe, expect, it } from 'vitest';
import { Semaphore } from '../../src/core/semaphore.js';

describe('Semaphore', () => {
  it('limits concurrent holders', async () => {
    const semaphore = new Semaphore(2);
    let active = 0;
    let peak = 0;

    await Promise.all(
      Array.from({ length: 6 }, async () => {
        await semaphore.acquire();
        active += 1;
        peak = Math.max(peak, active);
        await new Promise((resolve) => setTimeout(resolve, 10));
        active -= 1;
        semaphore.release();
      }),
    );

    expect(peak).toBeLessThanOrEqual(2);
  });
});
