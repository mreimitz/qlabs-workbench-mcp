FROM mcr.microsoft.com/playwright:v1.46.0-jammy AS deps
WORKDIR /app
RUN npm i -g pnpm@9.12.3
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY servers/mcp-playwright/package.json servers/mcp-playwright/package.json
RUN pnpm install --filter @qlabs/mcp-playwright...

FROM mcr.microsoft.com/playwright:v1.46.0-jammy AS build
WORKDIR /app
RUN npm i -g pnpm@9.12.3
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=deps /app/servers/mcp-playwright/node_modules /app/servers/mcp-playwright/node_modules
COPY --from=deps /app/pnpm-lock.yaml /app/pnpm-lock.yaml
COPY package.json pnpm-workspace.yaml tsconfig.base.json ./
COPY servers/mcp-playwright servers/mcp-playwright
RUN pnpm --filter @qlabs/mcp-playwright build

FROM mcr.microsoft.com/playwright:v1.46.0-jammy
WORKDIR /app/servers/mcp-playwright
ENV NODE_ENV=production
COPY --from=build /app/servers/mcp-playwright/dist dist
COPY --from=build /app/servers/mcp-playwright/node_modules node_modules
COPY --from=build /app/node_modules /app/node_modules
COPY servers/mcp-playwright/package.json package.json
EXPOSE 7010
CMD ["node", "dist/index.js"]
