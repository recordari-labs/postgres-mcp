import { Inject, Injectable, UseInterceptors } from '@nestjs/common';
import { Tool } from '@nestjs/mcp';
import { z } from 'zod';
import { APP_CONFIG } from '../config/config.tokens.js';
import type { AppConfig } from '../config/config.schema.js';
import { PostgresService } from '../database/postgres.service.js';
import { QueryExecutor } from '../database/query.executor.js';
import { LoggingInterceptor } from '../observability/logging.interceptor.js';
import { SqlRejectedError } from '../security/sql-rejected.error.js';

const readOnly = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
} as const;

@Injectable()
@UseInterceptors(LoggingInterceptor)
export class PostgresTools {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly postgres: PostgresService,
    private readonly executor: QueryExecutor,
  ) {}

  @Tool({
    name: 'list_schemas',
    description: 'List the database schemas this server is allowed to expose.',
    annotations: readOnly,
  })
  async listSchemas(): Promise<{ schemas: string[] }> {
    this.assertIntrospection();
    return { schemas: await this.postgres.listSchemas() };
  }

  @Tool({
    name: 'list_tables',
    description: 'List tables and views visible in an authorized schema.',
    annotations: readOnly,
    inputSchema: z.object({
      schema: z.string().min(1).max(63).describe('Schema name'),
    }),
  })
  async listTables(input: { schema: string }): Promise<{ tables: Awaited<ReturnType<PostgresService['listTables']>> }> {
    this.assertIntrospection();
    return { tables: await this.postgres.listTables(input.schema) };
  }

  @Tool({
    name: 'describe_table',
    description: 'Describe columns, types, defaults and indexes of an authorized table or view.',
    annotations: readOnly,
    inputSchema: z.object({
      schema: z.string().min(1).max(63).describe('Schema name'),
      table: z.string().min(1).max(63).describe('Table or view name'),
    }),
  })
  async describeTable(input: { schema: string; table: string }) {
    this.assertIntrospection();
    return this.postgres.describeTable(input.schema, input.table);
  }

  @Tool({
    name: 'execute_query',
    description:
      'Run one read-only SELECT against authorized relations. Results are row-limited and time-limited. INSERT, UPDATE, DELETE and DDL are rejected.',
    annotations: readOnly,
    inputSchema: z.object({
      sql: z.string().min(1).describe('A single SELECT or WITH ... SELECT statement'),
    }),
  })
  async executeQuery(input: { sql: string }) {
    return this.executor.execute(input.sql);
  }

  private assertIntrospection(): void {
    if (!this.config.security.introspection.enabled) {
      throw new SqlRejectedError('Introspection tools are disabled');
    }
  }
}
