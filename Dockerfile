# Build the static site
FROM node:24-alpine AS build
WORKDIR /app
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

# Serve it. Hash routing (#/runs) means nginx's default config is enough.
FROM nginx:stable-alpine
COPY --from=build /app/dist /usr/share/nginx/html
