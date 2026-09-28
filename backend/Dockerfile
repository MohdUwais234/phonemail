FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY backend/package.json backend/package.json
COPY web/package.json web/package.json
RUN npm ci
COPY backend backend
COPY database database
RUN npm run build -w backend && npm prune --omit=dev
FROM node:22-bookworm-slim
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/backend/package.json ./backend/package.json
COPY --from=build --chown=node:node /app/backend/dist ./backend/dist
COPY --from=build --chown=node:node /app/database ./database
USER node
EXPOSE 3000
CMD ["node","backend/dist/server.js"]
