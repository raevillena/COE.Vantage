FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --only=production

# Expect pre-built artifacts in the build context:
# - /dist from `npm run build`
# - /prisma (with generated client) from `npx prisma generate`
COPY dist ./dist
COPY prisma ./prisma

EXPOSE 4000

CMD ["node", "dist/index.js"]

