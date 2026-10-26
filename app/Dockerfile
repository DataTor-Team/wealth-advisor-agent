# Build the app, then serve it with nginx, which also forwards /v1 to the agent.
FROM node:24-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run build

FROM nginxinc/nginx-unprivileged:1.30-alpine
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
# The agent's /v1 API as scheme://host:port. The default is the agent's Service in a cluster.
ENV AGENT_URL=http://wealth-advisor-agent:8080
EXPOSE 8080
