import { parse } from 'pgsql-parser';
import type { AppConfig } from '../config/config.schema.js';
import { PolicyError, PolicyService, type QualifiedRelation } from '../core/policy.service.js';
import { SqlRejectedError } from './sql-rejected.error.js';

const DENIED_FUNCTIONS = new Set([
  'dblink',
  'dblink_exec',
  'dblink_connect',
  'dblink_connect_u',
  'lo_import',
  'lo_export',
  'lo_from_bytea',
  'pg_read_file',
  'pg_read_binary_file',
  'pg_read_server_files',
  'pg_ls_dir',
  'pg_ls_logdir',
  'pg_ls_waldir',
  'pg_stat_file',
  'pg_terminate_backend',
  'pg_cancel_backend',
  'pg_reload_conf',
  'pg_rotate_logfile',
  'set_config',
  'pg_sleep',
  'nextval',
  'setval',
  'pg_advisory_lock',
  'pg_advisory_lock_shared',
]);

interface RawRelation {
  schema?: string;
  name: string;
}

export interface PreparedQuery {
  sql: string;
  relations: QualifiedRelation[];
}

export class SqlValidator {
  constructor(
    private readonly policy: PolicyService,
    private readonly limits: AppConfig['security']['queries'],
  ) {}

  async prepare(sql: string): Promise<PreparedQuery> {
    if (sql.length > this.limits.maxSqlLength) {
      throw new SqlRejectedError(`SQL exceeds maxSqlLength (${this.limits.maxSqlLength})`);
    }

    const trimmed = sql.trim().replace(/;+\s*$/u, '').trim();
    if (!trimmed) {
      throw new SqlRejectedError('SQL is empty');
    }

    let parsed: { stmts?: Array<{ stmt?: Record<string, unknown> }> };
    try {
      parsed = (await parse(trimmed)) as { stmts?: Array<{ stmt?: Record<string, unknown> }> };
    } catch {
      throw new SqlRejectedError('SQL could not be parsed and was rejected');
    }

    const statements = parsed.stmts ?? [];
    if (statements.length !== 1) {
      throw new SqlRejectedError('Only a single SQL statement is allowed');
    }

    const stmt = statements[0]?.stmt;
    if (!stmt?.SelectStmt) {
      const kind = stmt ? Object.keys(stmt)[0] : 'empty';
      throw new SqlRejectedError(`Only SELECT is allowed (got ${kind})`);
    }

    const errors: string[] = [];
    const relations: RawRelation[] = [];
    walkSelect(stmt.SelectStmt as Record<string, unknown>, new Set(), relations, errors);
    if (errors.length > 0) {
      throw new SqlRejectedError(errors[0] ?? 'SQL was rejected');
    }

    let qualified: QualifiedRelation[];
    try {
      qualified = relations.map((relation) => this.policy.qualify(relation));
    } catch (error) {
      if (error instanceof PolicyError) {
        throw new SqlRejectedError(error.message);
      }
      throw error;
    }

    for (const relation of qualified) {
      if (!this.policy.allows(relation.schema, relation.name)) {
        throw new SqlRejectedError(`Relation ${relation.schema}.${relation.name} is not allowed`);
      }
    }

    return { sql: trimmed, relations: dedupe(qualified) };
  }
}

function walkSelect(
  select: Record<string, unknown>,
  ctes: Set<string>,
  relations: RawRelation[],
  errors: string[],
): void {
  if (select.intoClause) {
    errors.push('SELECT INTO is not allowed');
  }
  if (select.lockingClause) {
    errors.push('Row locking clauses are not allowed');
  }

  const scope = new Set(ctes);
  const withClause = unwrap(select.withClause, 'WithClause');
  const cteNodes = Array.isArray(withClause?.ctes) ? withClause.ctes : [];
  for (const cteNode of cteNodes) {
    const cte = unwrap(cteNode, 'CommonTableExpr');
    if (typeof cte?.ctename === 'string') {
      scope.add(cte.ctename.toLowerCase());
    }
  }
  for (const cteNode of cteNodes) {
    const cte = unwrap(cteNode, 'CommonTableExpr');
    walk(cte?.ctequery, scope, relations, errors);
  }

  for (const [key, value] of Object.entries(select)) {
    if (key === 'withClause' || key === 'intoClause' || key === 'lockingClause') {
      continue;
    }
    walk(value, scope, relations, errors);
  }
}

function walk(node: unknown, ctes: Set<string>, relations: RawRelation[], errors: string[]): void {
  if (!node || typeof node !== 'object') {
    return;
  }
  if (Array.isArray(node)) {
    for (const item of node) {
      walk(item, ctes, relations, errors);
    }
    return;
  }

  const record = node as Record<string, unknown>;
  if (record.SelectStmt && typeof record.SelectStmt === 'object') {
    walkSelect(record.SelectStmt as Record<string, unknown>, ctes, relations, errors);
    return;
  }

  const statementKey = Object.keys(record).find((key) => key.endsWith('Stmt') && key !== 'SelectStmt');
  if (statementKey && Object.keys(record).length === 1) {
    errors.push(`Statement ${statementKey} is not allowed`);
    return;
  }

  const rangeKey = Object.keys(record).find((key) => key.startsWith('Range'));
  if (rangeKey === 'RangeVar') {
    const range = record.RangeVar as { schemaname?: string; relname?: string };
    if (typeof range.relname === 'string' && !ctes.has(range.relname.toLowerCase())) {
      relations.push({ schema: range.schemaname, name: range.relname });
    }
    return;
  }
  if (rangeKey === 'RangeSubselect') {
    walk(record.RangeSubselect, ctes, relations, errors);
    return;
  }
  if (rangeKey) {
    errors.push(`${rangeKey} is not allowed`);
    return;
  }

  if (record.FuncCall && typeof record.FuncCall === 'object') {
    const name = functionName(record.FuncCall as { funcname?: unknown });
    if (!name || DENIED_FUNCTIONS.has(name)) {
      errors.push(`Function ${name ?? '(unknown)'} is not allowed`);
    }
  }

  for (const value of Object.values(record)) {
    walk(value, ctes, relations, errors);
  }
}

function unwrap(node: unknown, key: string): Record<string, unknown> | undefined {
  if (!node || typeof node !== 'object') {
    return undefined;
  }
  const record = node as Record<string, unknown>;
  const nested = record[key];
  if (nested && typeof nested === 'object') {
    return nested as Record<string, unknown>;
  }
  return record;
}

function functionName(func: { funcname?: unknown }): string | undefined {
  if (!Array.isArray(func.funcname) || func.funcname.length === 0) {
    return undefined;
  }
  const last = func.funcname[func.funcname.length - 1] as { String?: { sval?: string } };
  return last.String?.sval?.toLowerCase();
}

function dedupe(relations: QualifiedRelation[]): QualifiedRelation[] {
  const seen = new Set<string>();
  const result: QualifiedRelation[] = [];
  for (const relation of relations) {
    const key = `${relation.schema}.${relation.name}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    result.push(relation);
  }
  return result;
}

export { DENIED_FUNCTIONS };
