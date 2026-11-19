import { Module } from '@nestjs/common';
import { APP_CONFIG } from '../config/config.tokens.js';
import type { AppConfig } from '../config/config.schema.js';
import { PolicyService } from '../core/policy.service.js';
import { SqlValidator } from '../security/sql.validator.js';
import { PG_POOL } from './database.tokens.js';
import { createPool, PostgresService } from './postgres.service.js';
import { QueryExecutor } from './query.executor.js';
import { RelationGuard } from './relation-guard.js';

@Module({
  providers: [
    {
      provide: PolicyService,
      useFactory: (config: AppConfig) => new PolicyService(config.security.access),
      inject: [APP_CONFIG],
    },
    {
      provide: SqlValidator,
      useFactory: (config: AppConfig, policy: PolicyService) => new SqlValidator(policy, config.security.queries),
      inject: [APP_CONFIG, PolicyService],
    },
    {
      provide: PG_POOL,
      useFactory: (config: AppConfig) => createPool(config),
      inject: [APP_CONFIG],
    },
    RelationGuard,
    QueryExecutor,
    PostgresService,
  ],
  exports: [PolicyService, SqlValidator, QueryExecutor, PostgresService, PG_POOL],
})
export class DatabaseModule {}
