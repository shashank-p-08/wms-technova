# syntax=docker/dockerfile:1
# CloudWMS API - production image (ECS Fargate / any container runtime)

# ---- build: compile TypeScript with dev dependencies ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json nest-cli.json ./
COPY src ./src
RUN npm run build

# ---- deps: production dependencies only ----
FROM node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

# ---- runtime ----
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
# Run as the unprivileged "node" user that ships with the image
COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/dist ./dist
COPY --chown=node:node package.json ./
COPY --chown=node:node scripts ./scripts
# Amazon RDS CA bundle so the API can verify the database's TLS certificate
# (DB_SSL=true, DB_SSL_CA_PATH=/app/certs/rds-global-bundle.pem)
ADD --chown=node:node --chmod=444 https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem /app/certs/rds-global-bundle.pem
USER node
EXPOSE 3000
# Container-level health check; the ALB target group should also use /api/health
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/api/health >/dev/null || exit 1
# Pending migrations are applied at startup (DB_MIGRATIONS_RUN defaults to true in production)
CMD ["node", "dist/main"]
