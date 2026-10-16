# Heavyworks Garage app image. Built and run by deploy/docker-compose.yml.
FROM node:22-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 STORAGE_DIR=/data/storage PORT=3000
# Dev tools (tsx) stay in the image so migrations and `user:create` can run inside it.
COPY --from=build --chown=node:node /app /app
RUN mkdir -p /data/storage && chown -R node:node /data
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
# Bring the database up to date, then start the app.
CMD ["sh", "-c", "npm run db:migrate && exec npx next start -p 3000"]
