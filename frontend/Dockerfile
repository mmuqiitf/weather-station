# syntax=docker/dockerfile:1

FROM node:24-alpine AS base
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Dev-only image: no `npm run build` here — the compose stack bind-mounts
# ./frontend and runs the dev server, so changes apply without rebuilding.
ENV NODE_ENV=development
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "-p", "3000", "-H", "0.0.0.0"]
