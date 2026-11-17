FROM node:20-alpine AS base
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl

FROM base AS development
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY . .
RUN npm run prisma:generate --workspace=apps/api
EXPOSE 3001
CMD ["npm", "run", "dev", "--workspace=apps/api"]

FROM development AS builder
RUN npm run build --workspace=apps/api

FROM base AS production
ENV NODE_ENV=production
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/prisma ./apps/api/prisma
COPY apps/api/package.json ./apps/api/package.json
USER node
EXPOSE 3001
CMD ["node", "apps/api/dist/src/main.js"]
