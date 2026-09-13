FROM node:22-alpine
WORKDIR /app
COPY server/package.json server/package-lock.json ./server/
RUN cd server && npm ci --omit=dev
COPY server/*.mjs ./server/
COPY shared/ ./shared/
COPY scripts/backup-db.mjs scripts/backup-lib.mjs scripts/restore-db.mjs scripts/check-health.mjs ./scripts/
RUN mkdir -p /data && chown node:node /data
ENV HOST=0.0.0.0 PORT=3001 DB_PATH=/data/duelou.sqlite BACKUP_DIR=/data/backups
VOLUME ["/data"]
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1:3001/health || exit 1
USER node
CMD ["node", "--experimental-sqlite", "server/server.mjs"]
