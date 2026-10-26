FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY shared/ ./shared/
COPY client/ ./client/
COPY gateway/ ./gateway/
COPY issuer/issuer-public-key.json ./issuer/issuer-public-key.json
EXPOSE 3002
CMD ["node", "gateway/index.js"]
