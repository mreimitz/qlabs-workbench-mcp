FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY vendor vendor
COPY apps/admin-ui/package.json apps/admin-ui/package.json
RUN pnpm install --filter @qlabs/admin-ui...

FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/apps/admin-ui/node_modules /app/apps/admin-ui/node_modules
COPY --from=deps /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY vendor vendor
COPY apps/admin-ui apps/admin-ui
RUN pnpm --filter @qlabs/admin-ui build

FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/apps/admin-ui/.next/standalone .
COPY --from=build /app/apps/admin-ui/.next/static ./apps/admin-ui/.next/static
COPY --from=build /app/apps/admin-ui/public ./apps/admin-ui/public
EXPOSE 3000
CMD ["node", "apps/admin-ui/server.js"]
