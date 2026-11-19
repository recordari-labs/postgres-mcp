# syntax=docker/dockerfile:1

FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build
RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
RUN useradd --system --uid 10001 --create-home mcp
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY assets ./assets
ARG VERSION=dev
LABEL org.opencontainers.image.title="postgres-mcp" \
      org.opencontainers.image.description="A secure, self-hosted PostgreSQL MCP server. Read-only by default." \
      org.opencontainers.image.version="${VERSION}" \
      org.opencontainers.image.source="https://github.com/recordari/postgres-mcp" \
      org.opencontainers.image.licenses="Apache-2.0" \
      org.opencontainers.image.vendor="Recordari"
USER mcp
EXPOSE 3000
ENV CONFIG_PATH=/app/config.yaml
ENV NODE_ENV=production
CMD ["node", "dist/main.js"]
