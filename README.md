# FrameSync

Real-time video collaboration: sync playback, comments, markers, and live drawing across multiple viewers.

## Live demo

**https://framesync-demo.vercel.app/**

The app is deployed on free-tier hosting (Vercel + Render). Free servers often **sleep after inactivity** and can take **50–60 seconds** to wake up from a cold start. If the first load is slow or times out, wait a minute and refresh—the app works; the delay is due to free-tier limits, not a bug.

---

## Prerequisites

- **Docker** and **Docker Compose** (for running the stack locally)
- **Node.js 18+** and **pnpm** (optional; only if you run backend/frontend without Docker)

## Local setup

1. **Environment files**
   - Copy `backend/.env.example` → `backend/.env` and set values (DB, Redis, S3/MinIO, JWT, etc.).
   - Copy `frontend/.env.example` → `frontend/.env` and set `NEXT_PUBLIC_API_URL` (e.g. `http://localhost:8000`).

2. **Run with Docker**

   **Development** (hot reload, backend on 8000, frontend on 3000):

   ```bash
   docker compose --profile dev up --build
   ```

   **Production-like** (built images, no volume mounts):

   ```bash
   docker compose --profile prod up --build
   ```

   Open the app at **http://localhost:3000**. API at **http://localhost:8000**.

3. **Without Docker**  
   Start PostgreSQL, Redis, and MinIO (or use your own URLs in `.env`), then run `pnpm install` and `pnpm dev` in `backend/` and `frontend/` respectively.

If you change ports and use Docker, update the port mappings in the Dockerfiles and `docker-compose.yml`.
