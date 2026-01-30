FROM oven/bun:1

WORKDIR /app

# Copy package files
COPY package.json bun.lock* ./

# Install dependencies
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Build TypeScript
RUN bun build ./src/index.ts --outdir ./dist --target bun

# Expose port
EXPOSE 3333

# Start the server
CMD ["bun", "run", "dist/index.js"]
