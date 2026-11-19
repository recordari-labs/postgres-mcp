export function resolveRelease(
  version: string,
  tag?: string,
): {
  version: string;
  minor: string;
  latest: 'true' | 'false';
};
