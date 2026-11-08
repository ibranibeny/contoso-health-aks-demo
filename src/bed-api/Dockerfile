# syntax=docker/dockerfile:1
# Zero-dependency Node.js service: nothing to npm install, tiny attack surface.
FROM node:25-alpine
ENV NODE_ENV=production PORT=8080 SERVICE_NAME=bed-api
WORKDIR /app
COPY --chown=node:node package.json server.js ./
COPY --chown=node:node lib ./lib
USER node
EXPOSE 8080
CMD ["node", "server.js"]
