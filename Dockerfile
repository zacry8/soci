FROM node:22-alpine
WORKDIR /app
COPY package.json .
COPY backend/ ./backend/
EXPOSE 8787
CMD ["node", "backend/server.js"]
