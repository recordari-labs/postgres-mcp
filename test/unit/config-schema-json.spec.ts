import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const schemaPath = join(process.cwd(), 'docs', 'config.schema.json');

describe('docs/config.schema.json', () => {
  it('is present and describes the config input shape', () => {
    const schema = JSON.parse(readFileSync(schemaPath, 'utf8')) as {
      title?: string;
      required?: string[];
      properties?: Record<string, unknown>;
    };
    expect(schema.title).toBe('postgres-mcp configuration');
    expect(schema.required).toEqual(['database', 'security']);
    expect(schema.properties).toHaveProperty('database');
    expect(schema.properties).toHaveProperty('security');
  });
});