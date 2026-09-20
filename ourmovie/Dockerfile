# node:sqlite est en release candidate sans flag depuis Node 22.13 / 23.4 ;
# on cible 24.x pour avoir la version la plus mûre du module (cf. day1_objectives.md, Objectif D).

# ---- build stage ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY tsconfig.json tsconfig.client.json ./
COPY src ./src
RUN npm run build

# ---- runtime stage ----
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY --from=build /app/dist ./dist

EXPOSE 8099

CMD [ "node", "dist/index.js" ]
