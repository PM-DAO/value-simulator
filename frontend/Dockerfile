FROM node:20-slim AS base

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source
COPY . .

# Accept API URL as build arg (inlined into client JS by Next.js)
ARG NEXT_PUBLIC_API_URL=http://localhost:8000
ENV NEXT_PUBLIC_API_URL=${NEXT_PUBLIC_API_URL}

# Build (uses output: "standalone" in next.config.ts)
RUN npm run build

# Copy static assets into standalone
RUN cp -r public .next/standalone/ 2>/dev/null || true
RUN cp -r .next/static .next/standalone/.next/

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME=0.0.0.0

CMD ["node", ".next/standalone/server.js"]
