import { Global, Module, type DynamicModule } from '@nestjs/common';
import { APP_CONFIG } from './config.tokens.js';
import type { AppConfig } from './config.schema.js';

@Global()
@Module({})
export class AppConfigModule {
  static register(config: AppConfig): DynamicModule {
    return {
      module: AppConfigModule,
      global: true,
      providers: [{ provide: APP_CONFIG, useValue: config }],
      exports: [APP_CONFIG],
    };
  }
}
