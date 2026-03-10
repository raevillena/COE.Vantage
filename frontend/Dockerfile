FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.* ./
COPY index.html ./
COPY .env.production .env.production
COPY src ./src
COPY public ./public

RUN npm run build

FROM nginx:1.27-alpine AS runner

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

