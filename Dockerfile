# ---------- build klien ----------
FROM node:22-alpine AS client
WORKDIR /app
COPY shared ./shared
COPY client/package*.json ./client/
RUN cd client && npm ci
COPY client ./client
ARG VITE_SERVER_URL=""
ENV VITE_SERVER_URL=$VITE_SERVER_URL
RUN cd client && npm run build

# ---------- runtime server ----------
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY shared ./shared
COPY server ./server
COPY --from=client /app/client/dist ./client/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "server/src/index.js"]
