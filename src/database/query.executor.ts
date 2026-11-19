import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool } from 'pg';
import { APP_CONFIG } from '../config/config.tokens.js';
import type { AppConfig } from '../config/config.schema.js';
import { Semaphore } from '../core/semaphore.js';
import { SqlValidator } from '../security/sql.validator.js';
import { SqlRejectedError } from '../security/sql-rejected.error.js';
import { PG_POOL } from './database.tokens.js';
import { RelationGuard } from './relation-guard.js';
import { serializeValue, type QueryResponse } from './query-result.js';

@Injectable()
export class QueryExecutor {
  private readonly logger = new Logger(QueryExecutor.name);
  private readonly limiter: Semaphore;

  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly validator: SqlValidator,
    private readonly relations: RelationGuard,
  ) {
    this.limiter = new Semaphore(config.security.queries.maxConcurrent);
  }

  async execute(sql: string): Promise<QueryResponse> {
    const prepared = await this.validator.prepare(sql);
    const started = Date.now();
    await this.limiter.acquire();
    const client = await this.pool.connect();
    let opened = false;
    try {
      await client.query('BEGIN READ ONLY');
      opened = true;
      await client.query(`SELECT set_config('statement_timeout', $1, true)`, [
        String(this.config.security.queries.timeoutMs),
      ]);
      await this.relations.assertClosure(client, prepared.relations);
      if (this.config.logging.logQueries) {
        this.logger.log(`query ${prepared.sql}`);
      }
      await client.query(`DECLARE mcp_result NO SCROLL CURSOR FOR ${prepared.sql}`);
      const fetched = await client.query(
        `FETCH ${this.config.security.queries.maxRows + 1} FROM mcp_result`,
      );
      await client.query('CLOSE mcp_result');
      await client.query('COMMIT');
      opened = false;

      const truncated = fetched.rows.length > this.config.security.queries.maxRows;
      const rows = (truncated ? fetched.rows.slice(0, this.config.security.queries.maxRows) : fetched.rows).map(
        (row) => serializeValue(row) as Record<string, unknown>,
      );
      return {
        columns: fetched.fields.map((field) => ({ name: field.name, dataTypeId: field.dataTypeID })),
        rows,
        rowCount: rows.length,
        truncated,
        durationMs: Date.now() - started,
      };
    } catch (error) {
      if (opened) {
        await client.query('ROLLBACK').catch(() => undefined);
      }
      if (error instanceof SqlRejectedError) {
        throw error;
      }
      const message = error instanceof Error ? error.message : 'Query failed';
      throw new SqlRejectedError(message);
    } finally {
      client.release();
      this.limiter.release();
    }
  }
}
