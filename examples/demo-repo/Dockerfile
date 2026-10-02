FROM node:20-alpine AS build
WORKDIR /app
COPY . .
RUN npm ci --omit=dev

FROM debian:bullseye-slim
COPY --from=build /app /app
CMD ["node", "/app/src/server.js"]
