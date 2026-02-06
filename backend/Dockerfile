# Use a lightweight Node image
FROM node:18-bullseye-slim AS base

# 1. Install System Dependencies (FFmpeg is mandatory)
RUN apt-get update && apt-get install -y ffmpeg python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# 2. Set Working Directory
WORKDIR /app

# 3. Enable corepack
RUN corepack enable

# 4. Install Dependencies (Cached Layer)
FROM base AS deps

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

# 5. Dev Target (for hot reload)
FROM deps AS dev

COPY . .
EXPOSE 8000
CMD ["pnpm", "dev"]

# 6. Build Target (for production)
FROM deps AS build

COPY . .
RUN pnpm build

# 7. Prod Target (shipping only dist + prod deps)
FROM base AS prod

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/dist ./dist

EXPOSE 8000
CMD ["node", "dist/index.js"]