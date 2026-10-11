FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY shared/ ./shared/
COPY client/ ./client/
COPY issuer/issuer-public-key.json ./issuer/issuer-public-key.json
CMD ["node", "client/index.js"]
