import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database/database.module.js';
import { LoggingInterceptor } from '../observability/logging.interceptor.js';
import { PostgresTools } from './postgres.tools.js';

@Module({
  imports: [DatabaseModule],
  providers: [PostgresTools, LoggingInterceptor],
})
export class McpToolsModule {}
