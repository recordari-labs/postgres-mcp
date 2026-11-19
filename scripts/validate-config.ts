import { loadAppConfig } from '../src/config/config.loader.js';
import { ConfigError } from '../src/config/config.error.js';

function main(): void {
  const configPath = process.env.CONFIG_PATH ?? 'config.yaml';
  try {
    const config = loadAppConfig();
    const schemas = config.security.access.schemas.allow?.join(', ') ?? '(none)';
    process.stdout.write(
      `OK ${configPath}\n  readonly: ${config.security.readonly}\n  mcp path: ${config.server.path}\n  allowed schemas: ${schemas}\n  maxRows: ${config.security.queries.maxRows}\n`,
    );
  } catch (error) {
    const message = error instanceof ConfigError || error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }
}

main();