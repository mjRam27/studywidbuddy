# Build context: repository root (the web app imports packages/shared by path).
#   docker build -f apps/web/Dockerfile -t studywidbuddy-web .

FROM node:22-alpine AS build
WORKDIR /repo
COPY packages/shared packages/shared
COPY apps/web/package.json apps/web/package-lock.json apps/web/
RUN cd apps/web && npm ci
COPY apps/web apps/web
RUN cd apps/web && npx ng build --configuration production

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist/web/browser /usr/share/nginx/html
EXPOSE 80
