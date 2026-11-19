import { Inject, Injectable } from '@nestjs/common';
import type { PoolClient } from 'pg';
import { APP_CONFIG } from '../config/config.tokens.js';
import type { AppConfig } from '../config/config.schema.js';
import { PolicyService, type QualifiedRelation } from '../core/policy.service.js';
import { DENIED_FUNCTIONS } from '../security/sql.validator.js';
import { SqlRejectedError } from '../security/sql-rejected.error.js';

const MAX_DEPTH = 16;

interface RelationRow {
  schema: string;
  name: string;
  kind: string;
}

interface FunctionRow {
  schema: string;
  name: string;
}

const RELATION_DEPS = `
WITH RECURSIVE rels AS (
  SELECT c.oid, n.nspname AS schema, c.relname AS name, c.relkind::text AS kind, 0 AS depth
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = $1 AND c.relname = $2
  UNION
  SELECT c2.oid, n2.nspname, c2.relname, c2.relkind::text, rels.depth + 1
  FROM rels
  JOIN pg_rewrite rw ON rw.ev_class = rels.oid
  JOIN pg_depend d ON d.objid = rw.oid
  JOIN pg_class c2 ON c2.oid = d.refobjid
  JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
  WHERE d.refclassid = 'pg_class'::regclass
    AND d.deptype = 'n'
    AND c2.oid <> rels.oid
    AND c2.relkind IN ('r', 'p', 'v', 'm', 'f')
    AND rels.depth < $3
)
SELECT schema, name, kind, depth FROM rels
`;

const FUNCTION_DEPS = `
SELECT n.nspname AS schema, p.proname AS name
FROM pg_class v
JOIN pg_namespace vn ON vn.oid = v.relnamespace
JOIN pg_rewrite rw ON rw.ev_class = v.oid
JOIN pg_depend d ON d.objid = rw.oid
JOIN pg_proc p ON p.oid = d.refobjid
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE vn.nspname = $1
  AND v.relname = $2
  AND d.refclassid = 'pg_proc'::regclass
  AND d.deptype = 'n'
`;

@Injectable()
export class RelationGuard {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly policy: PolicyService,
  ) {}

  async assertClosure(client: PoolClient, relations: QualifiedRelation[]): Promise<void> {
    if (!this.config.security.introspection.expandViews) {
      return;
    }

    const pending = [...relations];
    const seen = new Set<string>();

    while (pending.length > 0) {
      const relation = pending.shift();
      if (!relation) {
        break;
      }
      const key = `${relation.schema}.${relation.name}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);

      const dependencies = await client.query<RelationRow & { depth: number }>(RELATION_DEPS, [
        relation.schema,
        relation.name,
        MAX_DEPTH,
      ]);
      if (dependencies.rows.some((row) => row.depth >= MAX_DEPTH)) {
        throw new SqlRejectedError(`Dependency depth exceeded for ${key}`);
      }

      for (const row of dependencies.rows) {
        const qualified = { schema: row.schema, name: row.name };
        const dependencyKey = `${qualified.schema}.${qualified.name}`;
        if (!this.policy.allows(qualified.schema, qualified.name)) {
          throw new SqlRejectedError(`Relation ${dependencyKey} is not allowed`);
        }
        if (!seen.has(dependencyKey) && (row.kind === 'v' || row.kind === 'm')) {
          pending.push(qualified);
        }
      }

      const functions = await client.query<FunctionRow>(FUNCTION_DEPS, [relation.schema, relation.name]);
      for (const fn of functions.rows) {
        if (fn.schema !== 'pg_catalog' || DENIED_FUNCTIONS.has(fn.name.toLowerCase())) {
          throw new SqlRejectedError(`Function ${fn.schema}.${fn.name} used by ${key} is not allowed`);
        }
      }
    }
  }

}
