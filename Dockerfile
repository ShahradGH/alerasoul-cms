# PORTABILITY_ESCAPE_HATCH_ONLY — Live production runs on Cloudflare Workers/PaaS
FROM node:24-alpine AS runner
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN corepack enable && pnpm install --frozen-lockfile
COPY . .
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN pnpm run build
EXPOSE 3000
CMD ["pnpm", "start"]
