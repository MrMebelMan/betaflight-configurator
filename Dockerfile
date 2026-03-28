FROM node:24-alpine AS build

WORKDIR /app

COPY package.json yarn.lock ./
RUN corepack enable && yarn install --immutable

COPY . .

ARG GIT_REVISION=unknown
ENV VITE_GIT_REVISION=${GIT_REVISION}
RUN yarn build

FROM nginx:alpine

COPY --from=build /app/src/dist /usr/share/nginx/html

EXPOSE 80
