import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Pool } from 'pg';
import type { AppConfig } from '../config/config.schema.js';
import { PolicyService } from '../core/policy.service.js';
import { SqlRejectedError } from '../security/sql-rejected.error.js';
import { PG_POOL } from './database.tokens.js';
import { RelationGuard } from './relation-guard.js';

export interface TableSummary {
  schema: string;
  name: string;
  kind: 'table' | 'view' | 'materialized_view' | 'foreign_table' | 'partitioned_table';
}

export interface ColumnSummary {
  name: string;
  type: string;
  nullable: boolean;
  defaultValue: string | null;
}

export interface IndexSummary {
  name: string;
  primary: boolean;
  unique: boolean;
  definition: string;
}

const KIND_MAP: Record<string, TableSummary['kind']> = {
  r: 'table',
  v: 'view',
  m: 'materialized_view',
  f: 'foreign_table',
  p: 'partitioned_table',
};

@Injectable()
export class PostgresService implements OnModuleInit, OnModuleDestroy {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    private readonly policy: PolicyService,
    private readonly relations: RelationGuard,
  ) {}

  async onModuleInit(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }

  async listSchemas(): Promise<string[]> {
    const result = await this.pool.query<{ nspname: string }>(`
      SELECT nspname
      FROM pg_namespace
      WHERE nspname <> 'information_schema'
        AND nspname <> 'pg_catalog'
        AND nspname <> 'pg_toast'
        AND nspname NOT LIKE 'pg_temp_%'
        AND nspname NOT LIKE 'pg_toast_temp_%'
        AND has_schema_privilege(oid, 'USAGE')
      ORDER BY nspname
    `);
    return result.rows.map((row) => row.nspname).filter((schema) => this.policy.schemaVisible(schema));
  }

  async listTables(schema: string): Promise<TableSummary[]> {
    const normalized = schema.toLowerCase();
    if (!this.policy.schemaVisible(normalized)) {
      throw new SqlRejectedError(`Schema ${normalized} is not allowed`);
    }
    const result = await this.pool.query<{ relname: string; relkind: string }>(
      `
      SELECT c.relname, c.relkind::text AS relkind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = $1
        AND c.relkind IN ('r', 'v', 'm', 'f', 'p')
        AND has_table_privilege(c.oid, 'SELECT')
      ORDER BY c.relname
    `,
      [normalized],
    );
    const visible: TableSummary[] = [];
    const client = await this.pool.connect();
    try {
      for (const row of result.rows.filter((candidate) => this.policy.allows(normalized, candidate.relname))) {
        try {
          await this.relations.assertClosure(client, [{ schema: normalized, name: row.relname }]);
        } catch (error) {
          if (error instanceof SqlRejectedError) {
            continue;
          }
          throw error;
        }
        visible.push({
          schema: normalized,
          name: row.relname,
          kind: KIND_MAP[row.relkind] ?? 'table',
        });
      }
    } finally {
      client.release();
    }
    return visible;
  }

  async describeTable(schema: string, table: string): Promise<{
    schema: string;
    table: string;
    columns: ColumnSummary[];
    indexes: IndexSummary[];
  }> {
    const normalizedSchema = schema.toLowerCase();
    const normalizedTable = table.toLowerCase();
    if (!this.policy.allows(normalizedSchema, normalizedTable)) {
      throw new SqlRejectedError(`Relation ${normalizedSchema}.${normalizedTable} is not allowed`);
    }
    const client = await this.pool.connect();
    try {
      await this.relations.assertClosure(client, [{ schema: normalizedSchema, name: normalizedTable }]);
    } finally {
      client.release();
    }

    const columns = await this.pool.query<{
      name: string;
      type: string;
      nullable: boolean;
      default_value: string | null;
    }>(
      `
      SELECT a.attname AS name,
             pg_catalog.format_type(a.atttypid, a.atttypmod) AS type,
             NOT a.attnotnull AS nullable,
             pg_get_expr(ad.adbin, ad.adrelid) AS default_value
      FROM pg_attribute a
      JOIN pg_class c ON c.oid = a.attrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN pg_attrdef ad ON ad.adrelid = a.attrelid AND ad.adnum = a.attnum
      WHERE n.nspname = $1
        AND c.relname = $2
        AND a.attnum > 0
        AND NOT a.attisdropped
        AND has_table_privilege(c.oid, 'SELECT')
      ORDER BY a.attnum
    `,
      [normalizedSchema, normalizedTable],
    );

    if (columns.rows.length === 0) {
      throw new SqlRejectedError(`Relation ${normalizedSchema}.${normalizedTable} is not visible`);
    }

    const indexes = await this.pool.query<{
      name: string;
      primary: boolean;
      unique: boolean;
      definition: string;
    }>(
      `
      SELECT i.relname AS name,
             ix.indisprimary AS primary,
             ix.indisunique AS unique,
             pg_get_indexdef(ix.indexrelid) AS definition
      FROM pg_index ix
      JOIN pg_class t ON t.oid = ix.indrelid
      JOIN pg_class i ON i.oid = ix.indexrelid
      JOIN pg_namespace n ON n.oid = t.relnamespace
      WHERE n.nspname = $1 AND t.relname = $2
      ORDER BY i.relname
    `,
      [normalizedSchema, normalizedTable],
    );

    return {
      schema: normalizedSchema,
      table: normalizedTable,
      columns: columns.rows.map((row) => ({
        name: row.name,
        type: row.type,
        nullable: row.nullable,
        defaultValue: row.default_value,
      })),
      indexes: indexes.rows,
    };
  }
}

export function createPool(config: AppConfig): Pool {
  return new Pool({
    connectionString: config.database.url,
    max: config.database.pool.max,
    connectionTimeoutMillis: config.database.pool.connectionTimeoutMs,
    statement_timeout: config.security.queries.timeoutMs,
    application_name: 'postgres-mcp',
    options: '-c default_transaction_read_only=on',
  });
}
