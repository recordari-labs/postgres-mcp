export class PolicyError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PolicyError';
  }
}

export interface AccessPolicy {
  defaultSchema?: string;
  schemas: { allow?: string[]; deny?: string[] };
  tables: { allow?: string[]; deny?: string[] };
}

export interface QualifiedRelation {
  schema: string;
  name: string;
}

export class PolicyService {
  readonly allowedSchemas: ReadonlySet<string>;
  readonly deniedSchemas: ReadonlySet<string>;
  readonly allowedTables: ReadonlySet<string> | null;
  readonly deniedTables: ReadonlySet<string>;
  readonly defaultSchema: string | null;

  constructor(access: AccessPolicy) {
    const schemaAllow = uniqueLower(access.schemas.allow ?? ['public']);
    const schemaDeny = uniqueLower(access.schemas.deny ?? []);
    const tableAllow = access.tables.allow?.map(normalizeQualified);
    const tableDeny = (access.tables.deny ?? []).map(normalizeQualified);

    const schemaOverlap = schemaAllow.filter((schema) => schemaDeny.includes(schema));
    if (schemaOverlap.length > 0) {
      throw new PolicyError(`Schema listed in both allow and deny: ${schemaOverlap.join(', ')}`);
    }

    const denyKeys = new Set(tableDeny.map(keyOf));
    const allowKeys = tableAllow ? new Set(tableAllow.map(keyOf)) : null;
    if (allowKeys) {
      for (const key of allowKeys) {
        if (denyKeys.has(key)) {
          throw new PolicyError(`Table listed in both allow and deny: ${key}`);
        }
        const schema = key.split('.')[0] ?? '';
        if (schemaDeny.includes(schema) || !schemaAllow.includes(schema)) {
          throw new PolicyError(`Allowed table ${key} is outside the allowed schemas`);
        }
      }
    }

    let defaultSchema = access.defaultSchema?.toLowerCase() ?? null;
    if (defaultSchema) {
      if (!schemaAllow.includes(defaultSchema) || schemaDeny.includes(defaultSchema)) {
        throw new PolicyError(`defaultSchema "${defaultSchema}" is not an allowed schema`);
      }
    } else if (schemaAllow.length === 1) {
      defaultSchema = schemaAllow[0] ?? null;
    } else if (schemaAllow.includes('public')) {
      defaultSchema = 'public';
    }

    this.allowedSchemas = new Set(schemaAllow);
    this.deniedSchemas = new Set(schemaDeny);
    this.allowedTables = allowKeys;
    this.deniedTables = denyKeys;
    this.defaultSchema = defaultSchema;
  }

  qualify(relation: { schema?: string; name: string }): QualifiedRelation {
    const name = relation.name.toLowerCase();
    const schema = relation.schema?.toLowerCase() ?? this.defaultSchema ?? undefined;
    if (!schema) {
      throw new PolicyError(`Unqualified relation "${relation.name}" is ambiguous under the current policy`);
    }
    return { schema, name };
  }

  allows(schema: string, table: string): boolean {
    const normalizedSchema = schema.toLowerCase();
    const key = `${normalizedSchema}.${table.toLowerCase()}`;
    if (this.deniedSchemas.has(normalizedSchema) || !this.allowedSchemas.has(normalizedSchema)) {
      return false;
    }
    if (this.deniedTables.has(key)) {
      return false;
    }
    if (this.allowedTables && !this.allowedTables.has(key)) {
      return false;
    }
    return true;
  }

  schemaVisible(schema: string): boolean {
    const normalized = schema.toLowerCase();
    return this.allowedSchemas.has(normalized) && !this.deniedSchemas.has(normalized);
  }
}

function uniqueLower(values: string[]): string[] {
  return [...new Set(values.map((value) => value.toLowerCase()))];
}

function normalizeQualified(value: string): QualifiedRelation {
  const [schema, name] = value.split('.');
  if (!schema || !name) {
    throw new PolicyError(`Invalid table reference "${value}". Use schema.table.`);
  }
  return { schema: schema.toLowerCase(), name: name.toLowerCase() };
}

function keyOf(relation: QualifiedRelation): string {
  return `${relation.schema}.${relation.name}`;
}
