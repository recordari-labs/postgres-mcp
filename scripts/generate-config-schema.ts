import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';
import { configSchema } from '../src/config/config.schema.js';
import { serverVersion } from '../src/version.js';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outPath = join(root, 'docs', 'config.schema.json');

const jsonSchema = z.toJSONSchema(configSchema, {
  target: 'draft-2020-12',
  io: 'input',
  unrepresentable: 'any',
}) as Record<string, unknown>;

const document = {
  ...jsonSchema,
  $id: 'https://recordari.github.io/postgres-mcp/config.schema.json',
  title: 'postgres-mcp configuration',
  description:
    'YAML configuration for the postgres-mcp server. Only ${DATABASE_URL} and ${MCP_TOKEN} may appear as env placeholders in YAML files.',
  'x-postgres-mcp-version': serverVersion,
};

writeFileSync(outPath, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
process.stdout.write(`Wrote ${outPath}\n`);