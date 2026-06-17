FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/storage-api/package.json apps/storage-api/package.json
RUN pnpm install --filter @qlabs/storage-api...

FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/storage-api/node_modules /app/apps/storage-api/node_modules
COPY --from=deps /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/storage-api apps/storage-api
RUN pnpm --filter @qlabs/storage-api build

FROM node:20-alpine
WORKDIR /app/apps/storage-api
ENV NODE_ENV=production
COPY --from=build /app/apps/storage-api/dist dist
COPY --from=build /app/apps/storage-api/node_modules node_modules
COPY --from=build /app/node_modules /app/node_modules
COPY apps/storage-api/package.json package.json
EXPOSE 4100
CMD ["node", "dist/index.js"]
