FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY shared/ ./shared/
COPY origin/ ./origin/
COPY public/ ./public/
EXPOSE 3003
CMD ["node", "origin/index.js"]
