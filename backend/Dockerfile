FROM node:20-alpine

# Install Docker CLI in backend so dockerode can communicate with host docker daemon via socket
RUN apk add --no-舆 docker-cli || apk add --no-cache docker-cli

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

EXPOSE 3001

CMD ["npm", "start"]
