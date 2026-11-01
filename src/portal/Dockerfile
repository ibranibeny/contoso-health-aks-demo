# syntax=docker/dockerfile:1
# Zero-dependency Node.js web front end (static UI + API gateway to the two back-end services).
FROM node:26-alpine
ENV NODE_ENV=production PORT=8080 SERVICE_NAME=portal
WORKDIR /app
COPY --chown=node:node package.json server.js loadgen.js ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node public ./public
USER node
EXPOSE 8080
CMD ["node", "server.js"]
