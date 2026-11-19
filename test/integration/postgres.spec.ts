import 'reflect-metadata';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Test } from '@nestjs/testing';
import { connectMcpClient } from '@nestjs/mcp/testing';
import type { INestApplication } from '@nestjs/common';
import { Pool } from 'pg';
import { loadAppConfig } from '../../src/config/config.loader.js';
import { AppModule } from '../../src/app.module.js';

const databaseUrl = process.env.DATABASE_URL;
const token = 'integration-token-0123456789';
const describeIntegration = databaseUrl ? describe : describe.skip;

function toolText(result: unknown): string {
  const content = (result as { content?: Array<{ text?: string }> }).content ?? [];
  return content.map((block) => block.text ?? '').join('\n');
}

describeIntegration('postgres integration', () => {
  let app: INestApplication;
  let admin: Pool;

  beforeAll(async () => {
    admin = new Pool({ connectionString: databaseUrl });
    await admin.query('DROP SCHEMA IF EXISTS private CASCADE');
    await admin.query('DROP VIEW IF EXISTS public.customer_secrets');
    await admin.query('DROP TABLE IF EXISTS public.user_credentials, public.customers CASCADE');
    await admin.query('CREATE SCHEMA private');
    await admin.query('CREATE TABLE public.customers (id int primary key, name text)');
    await admin.query('CREATE TABLE public.user_credentials (user_id int, secret text)');
    await admin.query('CREATE TABLE private.credentials (user_id int, secret text)');
    await admin.query(`
      CREATE VIEW public.customer_secrets AS
      SELECT c.id, k.secret
      FROM public.customers c
      JOIN private.credentials k ON k.user_id = c.id
    `);
    await admin.query(`INSERT INTO public.customers (id, name) VALUES (1, 'Ada'), (2, 'Grace')`);
    await admin.query(`INSERT INTO private.credentials (user_id, secret) VALUES (1, 'hidden')`);

    const dir = mkdtempSync(join(tmpdir(), 'postgres-mcp-it-'));
    const configPath = join(dir, 'config.yaml');
    writeFileSync(
      configPath,
      `
database:
  url: \${DATABASE_URL}
security:
  authentication:
    token: \${MCP_TOKEN}
    resource: http://127.0.0.1:3000/mcp
  access:
    schemas:
      allow: [public]
    tables:
      deny:
        - public.user_credentials
  queries:
    maxRows: 1
    timeoutMs: 2000
    maxConcurrent: 2
`,
    );
    const config = loadAppConfig({
      ...process.env,
      CONFIG_PATH: configPath,
      DATABASE_URL: databaseUrl,
      MCP_TOKEN: token,
    });
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule.register(config)],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    await app.listen(0, '127.0.0.1');
  });

  afterAll(async () => {
    await app?.close();
    await admin?.end();
  });

  it('lists only authorized tables and truncates query rows', async () => {
    const client = await connectMcpClient(app, { token });
    const tables = await client.callTool({ name: 'list_tables', arguments: { schema: 'public' } });
    const encoded = toolText(tables);
    expect(encoded).toContain('customers');
    expect(encoded).not.toContain('user_credentials');
    expect(encoded).not.toContain('customer_secrets');

    const query = await client.callTool({
      name: 'execute_query',
      arguments: { sql: 'SELECT id, name FROM public.customers ORDER BY id' },
    });
    const body = toolText(query);
    expect(body).toContain('"truncated":true');
    expect(body).toContain('Ada');
    expect(body).not.toContain('Grace');
    await client.close();
  });

  it('rejects indirect access through a view and through a join', async () => {
    const client = await connectMcpClient(app, { token });
    const throughView = await client.callTool({
      name: 'execute_query',
      arguments: { sql: 'SELECT secret FROM public.customer_secrets' },
    });
    expect(toolText(throughView)).toContain('not allowed');

    const throughJoin = await client.callTool({
      name: 'execute_query',
      arguments: {
        sql: 'SELECT * FROM public.customers c JOIN private.credentials k ON k.user_id = c.id',
      },
    });
    expect(toolText(throughJoin)).toContain('not allowed');
    await client.close();
  });

  it('rejects requests without a JSON content type', async () => {
    const address = app.getHttpServer().address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const response = await fetch(`http://127.0.0.1:${port}/mcp`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` },
      body: '{}',
    });
    expect(response.status).toBe(415);
  });
});
