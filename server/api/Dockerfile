FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY *.js schema.sql ./
USER node
EXPOSE 3000
CMD ["node", "server.js"]
