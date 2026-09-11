FROM node:22.12-alpine
WORKDIR /app
COPY server/package.json ./server/package.json
COPY server/server.mjs server/rules.mjs server/rooms.mjs ./server/
COPY shared/arcade.mjs ./shared/arcade.mjs
RUN mkdir -p /data && chown node:node /data
ENV HOST=0.0.0.0 PORT=3001 DB_PATH=/data/duelou.sqlite
VOLUME ["/data"]
EXPOSE 3001
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 CMD wget -qO- http://127.0.0.1:3001/health || exit 1
USER node
CMD ["node", "--experimental-sqlite", "server/server.mjs"]
