import { describe, expect, it } from 'vitest';
import { PolicyService } from '../../src/core/policy.service.js';
import { SqlRejectedError } from '../../src/security/sql-rejected.error.js';
import { SqlValidator } from '../../src/security/sql.validator.js';

const limits = {
  timeoutMs: 1000,
  maxRows: 10,
  maxConcurrent: 2,
  maxSqlLength: 200,
  singleStatement: true,
};

function validatorFor(policy = new PolicyService({ schemas: { allow: ['public'] }, tables: { deny: ['public.user_credentials'] } })) {
  return new SqlValidator(policy, limits);
}

describe('SqlValidator', () => {
  const validator = validatorFor();

  it('accepts a single select and records its relations', async () => {
    const prepared = await validator.prepare('SELECT id FROM public.customers WHERE active');
    expect(prepared.relations).toEqual([{ schema: 'public', name: 'customers' }]);
  });

  it('rejects a join into a denied relation', async () => {
    await expect(
      validator.prepare(`
        SELECT *
        FROM public.customers c
        JOIN private.credentials k ON k.user_id = c.id
      `),
    ).rejects.toThrow(/private\.credentials is not allowed/);
  });

  it('rejects a denied table in an otherwise allowed schema', async () => {
    await expect(validator.prepare('SELECT * FROM public.user_credentials')).rejects.toBeInstanceOf(SqlRejectedError);
  });

  it.each([
    'INSERT INTO public.customers (id) VALUES (1)',
    'UPDATE public.customers SET id = 1',
    'DELETE FROM public.customers',
    'DROP TABLE public.customers',
    'CREATE TABLE public.extra (id int)',
    'COPY public.customers TO STDOUT',
  ])('rejects %s', async (sql) => {
    await expect(validator.prepare(sql)).rejects.toThrow(SqlRejectedError);
  });

  it('rejects multiple statements', async () => {
    await expect(validator.prepare('SELECT 1; SELECT 2')).rejects.toThrow(/single SQL statement/);
  });

  it('rejects SQL over the configured length', async () => {
    await expect(validator.prepare(`SELECT ${'1'.repeat(250)}`)).rejects.toThrow(/maxSqlLength/);
  });

  it('does not treat a CTE name as a physical relation', async () => {
    const prepared = await validator.prepare(`
      WITH visible AS (SELECT id FROM public.customers)
      SELECT * FROM visible
    `);
    expect(prepared.relations).toEqual([{ schema: 'public', name: 'customers' }]);
  });

  it('rejects SELECT INTO and row locks', async () => {
    await expect(validator.prepare('SELECT id INTO public.copy FROM public.customers')).rejects.toThrow(/SELECT INTO/);
    await expect(validator.prepare('SELECT id FROM public.customers FOR UPDATE')).rejects.toThrow(/locking/i);
  });

  it('rejects file and network functions', async () => {
    await expect(validator.prepare("SELECT pg_read_file('/etc/passwd')")).rejects.toThrow(/pg_read_file/);
    await expect(validator.prepare("SELECT * FROM dblink('host=evil', 'SELECT 1') AS t(id int)")).rejects.toThrow(
      /not allowed/,
    );
  });

  it('rejects unqualified names when no default schema exists', async () => {
    const strict = validatorFor(
      new PolicyService({ schemas: { allow: ['analytics', 'billing'] }, tables: {} }),
    );
    await expect(strict.prepare('SELECT * FROM events')).rejects.toThrow(/Unqualified relation/);
  });
});
