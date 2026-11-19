const SEMVER = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function resolveRelease(version, tag = '') {
  if (!SEMVER.test(version)) {
    throw new Error(`package.json version is not a semantic version: ${version}`);
  }

  const normalizedTag = tag.startsWith('v') ? tag.slice(1) : tag;
  if (normalizedTag && normalizedTag !== version) {
    throw new Error(`Git tag ${tag} does not match package.json version ${version}`);
  }

  const [major, minor] = version.split('.');
  return {
    version,
    minor: `${major}.${minor}`,
    latest: version.includes('-') ? 'false' : 'true',
  };
}
