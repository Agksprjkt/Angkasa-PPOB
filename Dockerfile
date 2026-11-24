FROM node:24-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

FROM node:24-alpine AS runner

WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

RUN addgroup -S app && adduser -S app -G app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build --chown=app:app /app/.next ./.next
COPY --from=build --chown=app:app /app/next.config.mjs ./next.config.mjs
COPY --from=build --chown=app:app /app/public ./public
COPY --from=build --chown=app:app /app/drizzle ./drizzle
COPY --from=build --chown=app:app /app/scripts ./scripts
# Migration and bootstrap scripts import this type-stripped module directly.
COPY --from=build --chown=app:app /app/src/lib/system-config-core.ts ./src/lib/system-config-core.ts

RUN mkdir -p /app/.data && chown app:app /app/.data
USER app

EXPOSE 3000
CMD ["npm", "run", "start"]
