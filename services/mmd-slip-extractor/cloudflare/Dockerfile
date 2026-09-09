FROM node:22-bookworm-slim

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY lib ./lib
COPY cloudflare/container-server.mjs ./cloudflare/container-server.mjs

ENV NODE_ENV=production
ENV PORT=8080

USER node
EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/node", "/app/cloudflare/container-server.mjs"]
