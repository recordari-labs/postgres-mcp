import { appendFileSync, readFileSync } from 'node:fs';
import { resolveRelease } from './release-version.mjs';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const tag = process.argv[2] ?? '';

let release;
try {
  release = resolveRelease(pkg.version, tag);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

if (process.env.GITHUB_OUTPUT) {
  const body = `version=${release.version}\nminor=${release.minor}\nlatest=${release.latest}\n`;
  appendFileSync(process.env.GITHUB_OUTPUT, body);
}

process.stdout.write(`${release.version}\n`);
