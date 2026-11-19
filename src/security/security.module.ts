import { Module } from '@nestjs/common';
import { BearerTokenVerifier } from './bearer-token.verifier.js';
import { McpRequestGuard } from './mcp-request.guard.js';

@Module({
  providers: [BearerTokenVerifier, McpRequestGuard],
  exports: [BearerTokenVerifier, McpRequestGuard],
})
export class SecurityModule {}
