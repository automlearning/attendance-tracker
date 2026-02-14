FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json* ./
RUN npm ci

# Copy source and build
COPY . .
RUN npm run build

# Production stage
FROM node:20-alpine

WORKDIR /app

# Install serve globally
RUN npm install -g serve@14

# Copy built files
COPY --from=builder /app/dist ./dist

# Railway sets PORT env var
CMD sh -c "serve -s dist -l tcp://0.0.0.0:$PORT"
