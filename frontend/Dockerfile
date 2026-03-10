FROM node:22-alpine AS build
WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json vite.config.* ./
COPY index.html ./
COPY src ./src
COPY public ./public

ENV VITE_API_URL=""
ENV VITE_APP_VERSION=""

RUN npm run build

FROM nginx:1.27-alpine AS runner

COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

