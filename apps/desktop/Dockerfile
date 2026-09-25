# TeamChat frontend (desktop renderer, ReactJS + Vite dev server) — dev image.
# NOTE: this serves the React UI in a browser. The native Electron window
# still runs from the host (pnpm --filter @teamchat/desktop electron:dev).
FROM node:20-slim
WORKDIR /app
RUN npm install -g pnpm@latest
# NOTE: source is copied BEFORE pnpm install on purpose — pnpm links
# workspace node_modules via symlinks inside apps/*/<pkg>, and copying
# source after install would wipe those links (ERR_MODULE_NOT_FOUND).
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml jsconfig.json ./
COPY apps ./apps
COPY packages ./packages
RUN pnpm install
EXPOSE 5173
CMD ["pnpm", "--filter", "@teamchat/desktop", "dev:docker"]
