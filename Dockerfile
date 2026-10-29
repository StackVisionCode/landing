# --- Build: compila el Angular a estático prerenderizado (dist/landingpage/browser). ---
# node:24.22.2-slim (fijado al patch) = npm 11, igual que el packageManager del repo (npm ci exige lock en sync).
FROM node:24.22.2-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Runtime: nginx sirve el estático. Sin Node en runtime (el landing no tiene API dinámica). ---
FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/landingpage/browser /usr/share/nginx/html
EXPOSE 80
