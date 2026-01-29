# Use a lightweight Node image
FROM node:18-bullseye-slim

# 1. Install System Dependencies (FFmpeg is mandatory)
RUN apt-get update && apt-get install -y ffmpeg python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

# 2. Set Working Directory
WORKDIR /app

# 3. Install Dependencies (Cached Layer)
COPY package*.json ./
RUN npm install

# 4. Copy Source Code
COPY . .

# 5. Build TypeScript (for production)
# In dev, we override this with 'npm run dev'
RUN npm run build

# 6. Expose Port
EXPOSE 8000

# 7. Start Command
CMD ["npm", "start"]