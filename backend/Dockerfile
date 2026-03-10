FROM node:22-alpine AS base
WORKDIR /app

ENV NODE_ENV=production

# Install build dependencies
FROM base AS deps
RUN apk add --no-cache python3 make g++ openssl

COPY package.json package-lock.json ./
RUN npm ci --only=production && npm ci

COPY prisma ./prisma
RUN npx prisma generate

# Build TypeScript
FROM deps AS build
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Runtime image
FROM node:22-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --only=production

COPY --from=build /app/dist ./dist
COPY --from=deps /app/prisma ./prisma

EXPOSE 4000

CMD ["node", "dist/index.js"]

