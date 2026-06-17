FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/control-api/package.json apps/control-api/package.json
RUN pnpm install --filter @qlabs/control-api...

FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/control-api/node_modules /app/apps/control-api/node_modules
COPY --from=deps /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY apps/control-api apps/control-api
RUN pnpm --filter @qlabs/control-api build

FROM node:20-alpine
WORKDIR /app/apps/control-api
ENV NODE_ENV=production
COPY --from=build /app/apps/control-api/dist dist
COPY --from=build /app/apps/control-api/node_modules node_modules
COPY --from=build /app/node_modules /app/node_modules
COPY apps/control-api/package.json package.json
EXPOSE 4000
CMD ["node", "dist/index.js"]
