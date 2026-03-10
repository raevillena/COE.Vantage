FROM node:22-slim
WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update -y && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

RUN npm prune --production

COPY dist ./dist

EXPOSE 4000

CMD ["node", "dist/index.js"]