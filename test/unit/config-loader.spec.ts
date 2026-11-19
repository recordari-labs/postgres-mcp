import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError } from '../../src/config/config.error.js';
import { loadAppConfig } from '../../src/config/config.loader.js';

const token = 'test-token-value-0123456789';
const databaseUrl = 'postgres://mcp:mcp@localhost:5432/app';

function writeConfig(yaml: string): NodeJS.ProcessEnv {
  const dir = mkdtempSync(join(tmpdir(), 'postgres-mcp-'));
  const path = join(dir, 'config.yaml');
  writeFileSync(path, yaml);
  return {
    CONFIG_PATH: path,
    DATABASE_URL: databaseUrl,
    MCP_TOKEN: token,
  };
}

describe('loadAppConfig', () => {
  it('applies secure defaults and freezes the config', () => {
    const config = loadAppConfig(
      writeConfig(`
database:
  url: \${DATABASE_URL}
security:
  authentication:
    token: \${MCP_TOKEN}
`),
    );

    expect(config.security.readonly).toBe(true);
    expect(config.security.queries.maxRows).toBe(1000);
    expect(config.security.queries.singleStatement).toBe(true);
    expect(config.security.access.schemas.allow).toEqual(['public']);
    expect(config.server.path).toBe('/mcp');
    expect(config.security.authentication.resource).toBe('http://127.0.0.1:3000/mcp');
    expect(Object.isFrozen(config)).toBe(true);
    expect(Object.isFrozen(config.security)).toBe(true);
  });

  it('refuses to start when the file is missing', () => {
    expect(() => loadAppConfig({ CONFIG_PATH: 'missing-config.yaml' })).toThrow(ConfigError);
  });

  it('refuses an unknown placeholder', () => {
    expect(() =>
      loadAppConfig(
        writeConfig(`
database:
  url: \${OTHER_SECRET}
security:
  authentication:
    token: \${MCP_TOKEN}
`),
      ),
    ).toThrow(/Unsupported placeholder/);
  });

  it('refuses readonly false', () => {
    expect(() =>
      loadAppConfig(
        writeConfig(`
database:
  url: \${DATABASE_URL}
security:
  authentication:
    token: \${MCP_TOKEN}
  readonly: false
`),
      ),
    ).toThrow(/readonly must be true/);
  });

  it('refuses a schema that is both allowed and denied', () => {
    expect(() =>
      loadAppConfig(
        writeConfig(`
database:
  url: \${DATABASE_URL}
security:
  authentication:
    token: \${MCP_TOKEN}
  access:
    schemas:
      allow: [public]
      deny: [public]
`),
      ),
    ).toThrow(/both allow and deny/);
  });
});
