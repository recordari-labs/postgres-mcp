import { describe, expect, it } from 'vitest';
import { PolicyError, PolicyService } from '../../src/core/policy.service.js';

describe('PolicyService', () => {
  it('allows every table in an allowed schema except denials', () => {
    const policy = new PolicyService({
      schemas: { allow: ['public'] },
      tables: { deny: ['public.user_credentials'] },
    });

    expect(policy.allows('public', 'customers')).toBe(true);
    expect(policy.allows('public', 'user_credentials')).toBe(false);
    expect(policy.allows('private', 'customers')).toBe(false);
    expect(policy.defaultSchema).toBe('public');
  });

  it('treats an explicit table allow-list as closed', () => {
    const policy = new PolicyService({
      schemas: { allow: ['public'] },
      tables: { allow: ['public.customers'] },
    });

    expect(policy.allows('public', 'customers')).toBe(true);
    expect(policy.allows('public', 'orders')).toBe(false);
  });

  it('rejects an allowed table outside the allowed schemas', () => {
    expect(
      () =>
        new PolicyService({
          schemas: { allow: ['public'] },
          tables: { allow: ['private.credentials'] },
        }),
    ).toThrow(PolicyError);
  });

  it('requires qualification when several schemas are allowed and public is not', () => {
    const policy = new PolicyService({
      schemas: { allow: ['analytics', 'billing'] },
      tables: {},
    });

    expect(policy.defaultSchema).toBeNull();
    expect(() => policy.qualify({ name: 'events' })).toThrow(PolicyError);
    expect(policy.qualify({ schema: 'billing', name: 'Events' })).toEqual({
      schema: 'billing',
      name: 'events',
    });
  });
});
