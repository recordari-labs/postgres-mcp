import { Inject, Injectable } from '@nestjs/common';
import type { AuthInfo } from '@modelcontextprotocol/server';
import { APP_CONFIG } from '../config/config.tokens.js';
import type { AppConfig } from '../config/config.schema.js';
import { timingSafeStringEqual } from './timing-safe.js';

const TOKEN_TTL_SECONDS = 60 * 60 * 24 * 365;

@Injectable()
export class BearerTokenVerifier {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  verifyAccessToken(token: string): AuthInfo | null {
    const expected = this.config.security.authentication.token;
    if (!token || !timingSafeStringEqual(token, expected)) {
      return null;
    }
    const resource = this.config.security.authentication.resource;
    if (!resource) {
      return null;
    }
    return {
      token,
      clientId: 'static-bearer',
      scopes: ['postgres:read'],
      expiresAt: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
      resource: new URL(resource),
    };
  }
}
