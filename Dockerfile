# Generic container for any Docker host (Fly.io, Railway, Cloud Run, ...). Not exercised in CI: see docs/DEPLOYMENT.md.
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 8080
ENV PORT=8080
CMD ["npx", "tsx", "server/index.ts"]
