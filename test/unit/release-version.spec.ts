import { describe, expect, it } from 'vitest';
import { resolveRelease } from '../../scripts/release-version.mjs';

describe('resolveRelease', () => {
  it('accepts a matching tag and marks stable releases as latest', () => {
    expect(resolveRelease('0.1.0', 'v0.1.0')).toEqual({
      version: '0.1.0',
      minor: '0.1',
      latest: 'true',
    });
  });

  it('rejects a tag that does not match package.json', () => {
    expect(() => resolveRelease('0.1.0', 'v0.2.0')).toThrow(/does not match/);
  });

  it('does not move latest for a pre-release', () => {
    expect(resolveRelease('0.2.0-rc.1', 'v0.2.0-rc.1').latest).toBe('false');
  });

  it('rejects a version that is not semver', () => {
    expect(() => resolveRelease('1.0')).toThrow(/semantic version/);
  });
});
