FROM node:25-alpine AS build
RUN npm install -g bun
WORKDIR /app

COPY bun.lock ./
COPY package.json ./

RUN --mount=type=cache,target=/root/.bun bun install --frozen-lockfile --linker isolated

RUN bun update @p-stream/providers

ARG PWA_ENABLED="true"
ARG GA_ID
ARG APP_DOMAIN
ARG OPENSEARCH_ENABLED="false"
ARG TMDB_READ_API_KEY
ARG CORS_PROXY_URL
ARG DMCA_EMAIL
ARG NORMAL_ROUTER="false"
ARG BACKEND_URL
ARG HAS_ONBOARDING="false"
ARG ONBOARDING_CHROME_EXTENSION_INSTALL_LINK
ARG ONBOARDING_PROXY_INSTALL_LINK
ARG DISALLOWED_IDS
ARG CDN_REPLACEMENTS
ARG ALLOW_AUTOPLAY="false"

ENV VITE_PWA_ENABLED=${PWA_ENABLED}
ENV VITE_GA_ID=${GA_ID}
ENV VITE_APP_DOMAIN=${APP_DOMAIN}
ENV VITE_OPENSEARCH_ENABLED=${OPENSEARCH_ENABLED}
ENV VITE_TMDB_READ_API_KEY=${TMDB_READ_API_KEY}
ENV VITE_CORS_PROXY_URL=${CORS_PROXY_URL}
ENV VITE_DMCA_EMAIL=${DMCA_EMAIL}
ENV VITE_NORMAL_ROUTER=${NORMAL_ROUTER}
ENV VITE_BACKEND_URL=${BACKEND_URL}
ENV VITE_HAS_ONBOARDING=${HAS_ONBOARDING}
ENV VITE_ONBOARDING_CHROME_EXTENSION_INSTALL_LINK=${ONBOARDING_CHROME_EXTENSION_INSTALL_LINK}
ENV VITE_ONBOARDING_PROXY_INSTALL_LINK=${ONBOARDING_PROXY_INSTALL_LINK}
ENV VITE_DISALLOWED_IDS=${DISALLOWED_IDS}
ENV VITE_CDN_REPLACEMENTS=${CDN_REPLACEMENTS}
ENV VITE_ALLOW_AUTOPLAY=${ALLOW_AUTOPLAY}

COPY . ./
RUN bun run build

# production environment
FROM nginx:stable-alpine
ARG NORMAL_ROUTER="false"
ENV NORMAL_ROUTER=${NORMAL_ROUTER}
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx/default.browser.conf /etc/nginx/conf.d/default.browser.conf
COPY nginx/default.hash.conf /etc/nginx/conf.d/default.hash.conf
COPY nginx/40-select-router-config.sh /docker-entrypoint.d/40-select-router-config.sh
RUN chmod +x /docker-entrypoint.d/40-select-router-config.sh \
	&& rm -f /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
