# Spend Authority gateway + UI (Next.js). Single replica: the finalize lock lives in memory.
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
# NEXT_PUBLIC_* values are baked at build time; pass NEXT_PUBLIC_REOWN_PROJECT_ID as a build arg if you use it.
ARG NEXT_PUBLIC_REOWN_PROJECT_ID=""
ENV NEXT_PUBLIC_REOWN_PROJECT_ID=$NEXT_PUBLIC_REOWN_PROJECT_ID
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY --from=build /app ./
# Purchase history lives here: mount a persistent volume on /app/.data
RUN mkdir -p /app/.data
EXPOSE 3000
CMD ["sh", "-c", "npx next start -p ${PORT:-3000}"]