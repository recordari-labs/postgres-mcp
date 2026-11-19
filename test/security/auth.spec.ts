import 'reflect-metadata';
import { Test } from '@nestjs/testing';
import { connectMcpClient } from '@nestjs/mcp/testing';
import { McpModule } from '@nestjs/mcp';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { AppConfigModule } from '../../src/config/config.module.js';
import type { AppConfig } from '../../src/config/config.schema.js';
import { PostgresService } from '../../src/database/postgres.service.js';
import { QueryExecutor } from '../../src/database/query.executor.js';
import { PostgresTools } from '../../src/mcp/postgres.tools.js';
import { LoggingInterceptor } from '../../src/observability/logging.interceptor.js';
import { BearerTokenVerifier } from '../../src/security/bearer-token.verifier.js';

const token = 'test-token-value-0123456789';

const config = {
  server: { host: '127.0.0.1', port: 3000, path: '/mcp' },
  database: { url: 'postgres://mcp:mcp@localhost:5432/app', pool: { max: 1, connectionTimeoutMs: 1000 } },
  security: {
    authentication: { type: 'bearer' as const, token, resource: 'http://127.0.0.1:3000/mcp' },
    readonly: true,
    access: { schemas: { allow: ['public'] }, tables: {} },
    http: { allowedHosts: ['localhost', '127.0.0.1', '[::1]'] },
    queries: { timeoutMs: 1000, maxRows: 10, maxConcurrent: 1, maxSqlLength: 1000, singleStatement: true },
    introspection: { enabled: true, expandViews: true },
  },
  logging: { level: 'info', logQueries: false },
} as AppConfig;

describe('MCP authentication', () => {
  let app: INestApplication | undefined;

  afterEach(async () => {
    await app?.close();
    app = undefined;
  });

  async function createApp(): Promise<INestApplication> {
    const moduleRef = await Test.createTestingModule({
      imports: [
        AppConfigModule.register(config),
        McpModule.forRoot({
          name: 'postgres-mcp',
          version: '0.1.0',
          path: 'mcp',
          imports: [AppConfigModule.register(config)],
          http: { allowedHosts: ['localhost', '127.0.0.1', '[::1]'], responseMode: 'json' },
          auth: {
            verifier: BearerTokenVerifier,
            resource: 'http://127.0.0.1:3000/mcp',
            authorizationServers: ['http://127.0.0.1:3000'],
          },
        }),
      ],
      providers: [
        PostgresTools,
        LoggingInterceptor,
        BearerTokenVerifier,
        {
          provide: PostgresService,
          useValue: { listSchemas: vi.fn().mockResolvedValue(['public']) },
        },
        {
          provide: QueryExecutor,
          useValue: {
            execute: vi.fn().mockResolvedValue({
              columns: [],
              rows: [],
              rowCount: 0,
              truncated: false,
              durationMs: 1,
            }),
          },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
    return app;
  }

  it('rejects a missing token', async () => {
    const application = await createApp();
    await expect(connectMcpClient(application)).rejects.toThrow();
  });

  it('rejects an invalid token', async () => {
    const application = await createApp();
    await expect(connectMcpClient(application, { token: 'wrong-token-value-000' })).rejects.toThrow();
  });

  it('lists schemas with the configured token', async () => {
    const application = await createApp();
    const client = await connectMcpClient(application, { token });
    const result = await client.callTool({ name: 'list_schemas', arguments: {} });
    expect(JSON.stringify(result)).toContain('public');
    await client.close();
  });
});
