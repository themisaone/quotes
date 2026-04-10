FROM node:22-alpine

# pg_isready (from postgresql-client) is used by entrypoint.sh to wait for Postgres
RUN apk add --no-cache postgresql-client

WORKDIR /app

# Install dependencies first (better layer caching)
COPY package*.json ./
RUN npm ci --omit=dev

# Copy application source
COPY src/       ./src/
COPY migrations/ ./migrations/
COPY public/    ./public/
COPY scripts/   ./scripts/

# Copy default config — will be overridden by a mounted volume at runtime
COPY config/    ./config/

# Create attachments directory
RUN mkdir -p attachments

# Entrypoint script (waits for Postgres, then migrates + starts)
COPY docker/entrypoint.sh ./docker/entrypoint.sh
RUN chmod +x ./docker/entrypoint.sh

EXPOSE 4000

ENTRYPOINT ["./docker/entrypoint.sh"]
