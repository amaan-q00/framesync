FROM node:24-alpine AS base

WORKDIR /app

# pnpm via corepack
RUN corepack enable

FROM base AS deps

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM deps AS dev

# 2. Copy source code
# (In dev, this is technically overwritten by the volume, 
# but it's good practice for the image to work standalone)
COPY . .

# 3. Expose Port
EXPOSE 3000

# 4. Start Command
# Ensure "dev" script in package.json runs "next dev"
CMD ["pnpm", "dev"]

FROM deps AS build

# 2. Copy source code
COPY . .

# Build
RUN pnpm build

FROM base AS prod

ENV NODE_ENV=production

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/next.config.ts ./next.config.ts

# 3. Expose Port
EXPOSE 3000

# 4. Start Command
CMD ["pnpm", "start"]