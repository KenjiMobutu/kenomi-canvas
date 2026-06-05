FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY tsconfig.json ./
COPY src ./src

RUN npm install --omit=dev

ENV NODE_ENV=production
EXPOSE 4010

HEALTHCHECK --interval=15s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:4010/health > /dev/null 2>&1 || exit 1

CMD ["node", "--import", "tsx", "src/server.ts"]
