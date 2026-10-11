FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY shared/ ./shared/
COPY issuer/ ./issuer/
EXPOSE 3001
CMD ["node", "issuer/index.js"]
