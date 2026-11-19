import { readFileSync } from 'node:fs';
import { load as loadYaml } from 'js-yaml';
import { ConfigError } from './config.error.js';
import { configSchema, type AppConfig } from './config.schema.js';
import { PolicyError, PolicyService } from '../core/policy.service.js';

const ALLOWED_PLACEHOLDERS = new Set(['DATABASE_URL', 'MCP_TOKEN']);

export function loadAppConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const path = env.CONFIG_PATH ?? 'config.yaml';
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    throw new ConfigError(
      `Configuration file not found at ${path}. Refusing to start without an explicit policy.`,
    );
  }

  let parsed: unknown;
  try {
    parsed = loadYaml(raw);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new ConfigError(`Invalid YAML in ${path}: ${message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigError(`Invalid YAML in ${path}: expected an object`);
  }

  const substituted = substitutePlaceholders(parsed, env);
  const result = configSchema.safeParse(substituted);
  if (!result.success) {
    const details = result.error.issues
      .map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`)
      .join('; ');
    throw new ConfigError(`Invalid configuration: ${details}`);
  }

  const config = normalize(result.data);

  if (config.security.readonly === false && env.POSTGRES_MCP_ALLOW_WRITES !== 'true') {
    throw new ConfigError(
      'security.readonly is false. Refusing to start. v0.1 only runs READ ONLY transactions. Set POSTGRES_MCP_ALLOW_WRITES=true to bypass this check explicitly; writes are still not implemented.',
    );
  }

  if (!config.security.queries.singleStatement) {
    throw new ConfigError('security.queries.singleStatement must stay true in v0.1');
  }

  try {
    new PolicyService(config.security.access);
  } catch (error) {
    if (error instanceof PolicyError) {
      throw new ConfigError(error.message);
    }
    throw error;
  }

  return deepFreeze(config);
}

function normalize(config: AppConfig): AppConfig {
  const path = config.server.path.startsWith('/') ? config.server.path : `/${config.server.path}`;
  const routePath = path.slice(1);
  if (!routePath || routePath.includes('..') || routePath.endsWith('/')) {
    throw new ConfigError(`server.path "${config.server.path}" is not a single MCP route`);
  }

  const resource =
    config.security.authentication.resource ??
    `http://127.0.0.1:${config.server.port}${path}`;

  if (!URL.canParse(resource)) {
    throw new ConfigError(`security.authentication.resource is not an absolute URL: ${resource}`);
  }

  return {
    ...config,
    server: { ...config.server, path },
    security: {
      ...config.security,
      authentication: {
        ...config.security.authentication,
        resource,
      },
    },
  };
}

function substitutePlaceholders(value: unknown, env: NodeJS.ProcessEnv): unknown {
  if (typeof value === 'string') {
    return value.replace(/\$\{([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => {
      if (!ALLOWED_PLACEHOLDERS.has(name)) {
        throw new ConfigError(
          `Unsupported placeholder \${${name}}. Only DATABASE_URL and MCP_TOKEN can be interpolated.`,
        );
      }
      const resolved = env[name];
      if (!resolved) {
        throw new ConfigError(`Environment variable ${name} is required by the configuration.`);
      }
      return resolved;
    });
  }
  if (Array.isArray(value)) {
    return value.map((item) => substitutePlaceholders(item, env));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [key, substitutePlaceholders(nested, env)]),
    );
  }
  return value;
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const nested of Object.values(value)) {
      deepFreeze(nested);
    }
  }
  return value;
}

export function mcpRoutePath(config: AppConfig): string {
  return config.server.path.replace(/^\//, '');
}
