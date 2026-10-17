# Built SPA served by nginx, which also routes /api and /voice inside the compose
# network so the browser only ever talks to this one origin.
FROM node:20-slim AS build

WORKDIR /app

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./

# Empty means "same origin": the SPA then calls /api/... and /voice/... relatively,
# which this container proxies. No CORS, no hard-coded hostnames.
ARG VITE_API_URL=""
ARG VITE_VOICE_URL=""
ENV VITE_API_URL=$VITE_API_URL \
    VITE_VOICE_URL=$VITE_VOICE_URL

RUN npm run build


FROM nginx:1.27-alpine

COPY deploy/docker/frontend-nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1/ >/dev/null 2>&1 || exit 1

CMD ["nginx", "-g", "daemon off;"]
