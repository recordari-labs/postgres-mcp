import { z } from 'zod';

const identifier = z
  .string()
  .regex(/^[A-Za-z_][A-Za-z0-9_]*$/, 'Expected a PostgreSQL identifier');

const qualifiedName = z
  .string()
  .regex(
    /^[A-Za-z_][A-Za-z0-9_]*\.[A-Za-z_][A-Za-z0-9_]*$/,
    'Expected schema.table',
  );

const nameList = z.array(identifier);
const qualifiedList = z.array(qualifiedName);

export const configSchema = z.object({
  server: z
    .object({
      host: z.string().min(1).prefault('0.0.0.0'),
      port: z.number().int().min(1).max(65535).prefault(3000),
      path: z.string().min(1).prefault('/mcp'),
    })
    .prefault({}),
  database: z.object({
    url: z.string().min(1),
    pool: z
      .object({
        max: z.number().int().positive().prefault(5),
        connectionTimeoutMs: z.number().int().positive().prefault(5000),
      })
      .prefault({}),
  }),
  security: z
    .object({
      authentication: z.object({
        type: z.literal('bearer').prefault('bearer'),
        token: z.string().min(16, 'MCP token must be at least 16 characters'),
        resource: z.string().url().optional(),
      }),
      readonly: z.boolean().prefault(true),
      access: z
        .object({
          defaultSchema: identifier.optional(),
            schemas: z
              .object({
                allow: nameList.prefault(['public']),
                deny: nameList.optional(),
              })
              .prefault({}),
          tables: z
            .object({
              allow: qualifiedList.optional(),
              deny: qualifiedList.optional(),
            })
            .prefault({}),
        })
        .prefault({}),
      http: z
        .object({
          allowedHosts: z.array(z.string().min(1)).min(1).prefault(['localhost', '127.0.0.1', '[::1]']),
          allowedOrigins: z.array(z.string().min(1)).optional(),
        })
        .prefault({}),
      queries: z
        .object({
          timeoutMs: z.number().int().positive().prefault(10_000),
          maxRows: z.number().int().positive().prefault(1000),
          maxConcurrent: z.number().int().positive().prefault(3),
          maxSqlLength: z.number().int().positive().prefault(10_000),
          singleStatement: z.boolean().prefault(true),
        })
        .prefault({}),
      introspection: z
        .object({
          enabled: z.boolean().prefault(true),
          expandViews: z.boolean().prefault(true),
        })
        .prefault({}),
    }),
  logging: z
    .object({
      level: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).prefault('info'),
      logQueries: z.boolean().prefault(false),
    })
    .prefault({}),
});

export type AppConfig = z.infer<typeof configSchema>;
