# Builds the dashboard app as a live demo of @floo-one/nuxt-feedback.
# Coolify: pick "Dockerfile" as the build pack and set NUXT_GITHUB_TOKEN.
FROM node:22-alpine AS build
WORKDIR /app
RUN npm install -g pnpm@11.8.0

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY dashboard/package.json dashboard/
RUN pnpm install --frozen-lockfile

COPY . .
# dev:prepare generates the .nuxt/tsconfig.json files the builds extend
RUN pnpm dev:prepare && pnpm prepack && pnpm dev:build

FROM node:22-alpine
WORKDIR /app
COPY --from=build /app/dashboard/.output ./.output
ENV NODE_ENV=production
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000
EXPOSE 3000
CMD ["node", ".output/server/index.mjs"]
