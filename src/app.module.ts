import { DynamicModule, Module, UseGuards } from '@nestjs/common';
import { LoggerModule } from 'nestjs-pino';
import { McpModule, type McpModuleOptions } from '@nestjs/mcp';
import { AppConfigModule } from './config/config.module.js';
import { mcpRoutePath } from './config/config.loader.js';
import type { AppConfig } from './config/config.schema.js';
import { DatabaseModule } from './database/database.module.js';
import { HealthController } from './health/health.controller.js';
import { LogoController } from './health/logo.controller.js';
import { McpToolsModule } from './mcp/mcp-tools.module.js';
import { BearerTokenVerifier } from './security/bearer-token.verifier.js';
import { McpRequestGuard } from './security/mcp-request.guard.js';
import { SecurityModule } from './security/security.module.js';
import { serverVersion } from './version.js';

@Module({})
export class AppModule {
  static register(config: AppConfig): DynamicModule {
    const configModule = AppConfigModule.register(config);
    const resource = config.security.authentication.resource;
    if (!resource) {
      throw new Error('authentication.resource was not resolved');
    }
    const mcpOptions: McpModuleOptions = {
      name: 'postgres-mcp',
      version: serverVersion,
      title: 'postgres-mcp',
      description: 'Read-only PostgreSQL access for MCP clients, constrained by a YAML policy.',
      icons: [
        {
          src: new URL('/logo.png', resource).href,
          mimeType: 'image/png',
          sizes: ['1254x1254'],
        },
      ],
      instructions:
        'Use list_schemas, list_tables and describe_table before execute_query. Only single read-only SELECT statements against authorized relations are accepted.',
      http: {
        allowedHosts: config.security.http.allowedHosts,
        ...(config.security.http.allowedOrigins
          ? { allowedOrigins: config.security.http.allowedOrigins }
          : {}),
        legacy: 'stateless',
      },
      auth: {
        verifier: BearerTokenVerifier,
        resource,
        authorizationServers: [new URL(resource).origin],
        resourceName: 'postgres-mcp',
      },
    };

    return {
      module: AppModule,
      imports: [
        configModule,
        LoggerModule.forRoot({
          pinoHttp: {
            level: config.logging.level,
            redact: ['req.headers.authorization'],
            autoLogging: false,
          },
        }),
        DatabaseModule,
        SecurityModule,
        McpToolsModule,
        McpModule.forRoot({
          ...mcpOptions,
          path: mcpRoutePath(config),
          decorators: [UseGuards(McpRequestGuard)],
          imports: [configModule, SecurityModule],
        }),
      ],
      controllers: [HealthController, LogoController],
    };
  }
}
