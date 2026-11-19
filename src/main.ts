import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import type { NextFunction, Request, Response } from 'express';
import { ConfigError } from './config/config.error.js';
import { loadAppConfig } from './config/config.loader.js';
import { AppModule } from './app.module.js';

async function bootstrap(): Promise<void> {
  let config: ReturnType<typeof loadAppConfig>;
  try {
    config = loadAppConfig();
  } catch (error) {
    const message = error instanceof ConfigError || error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
  }

  const app = await NestFactory.create(AppModule.register(config), { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (req.method === 'POST' && normalizePath(req.path) === config.server.path) {
      const contentType = String(req.headers['content-type'] ?? '');
      if (!contentType.toLowerCase().startsWith('application/json')) {
        res.status(415).json({ error: 'Content-Type must be application/json' });
        return;
      }
    }
    next();
  });
  app.enableShutdownHooks();
  await app.listen(config.server.port, config.server.host);
}

function normalizePath(path: string): string {
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }
  return path;
}

bootstrap().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
});
