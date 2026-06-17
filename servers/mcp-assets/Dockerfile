FROM node:20-alpine AS deps
WORKDIR /app
RUN corepack enable
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY servers/mcp-assets/package.json servers/mcp-assets/package.json
RUN pnpm install --filter @qlabs/mcp-assets...

FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/servers/mcp-assets/node_modules /app/servers/mcp-assets/node_modules
COPY --from=deps /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY servers/mcp-assets servers/mcp-assets
RUN pnpm --filter @qlabs/mcp-assets build

FROM node:20-alpine
WORKDIR /app/servers/mcp-assets
ENV NODE_ENV=production
COPY --from=build /app/servers/mcp-assets/dist dist
COPY --from=build /app/servers/mcp-assets/node_modules node_modules
COPY --from=build /app/node_modules /app/node_modules
COPY servers/mcp-assets/package.json package.json
EXPOSE 7040
CMD ["node", "dist/index.js"]
