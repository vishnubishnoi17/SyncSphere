# SyncSphere

Local-first collaborative workspace with real-time sync, offline support, and conflict resolution.

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL 14+ (or Docker)

### 1. Install dependencies
```bash
npm run install:all
```

### 2. Configure environment
```bash
cp .env.example server/.env
# Edit server/.env with your DB credentials
```

### 3. Start with Docker (recommended)
```bash
docker compose up -d
```

### 3b. Start manually
```bash
# Terminal 1 — server
cd server && npm run dev

# Terminal 2 — client
cd client && npm run dev
```

Open http://localhost:5173

## Architecture

```
client/src/
  sync/          # SyncEngine + offlineQueue + conflictResolver
  storage/       # Dexie (IndexedDB) local DB
  websocket/     # Socket.IO client
  state/         # Zustand stores (auth, notes)
  hooks/         # useNotes, useSync
  components/    # UI components
  pages/         # AuthPage, WorkspacePage

server/src/
  controllers/   # auth, notes, sync
  services/      # business logic
  routes/        # Express router
  websocket/     # Socket.IO gateway
  middleware/    # JWT auth
  db/            # pg pool + schema.sql
```

## Features

- **Offline-first**: All writes go to IndexedDB immediately
- **Sync engine**: Push/pull with retry + exponential backoff
- **Conflict resolution**: Field-level merge (longer content wins) + last-write-wins fallback
- **Real-time**: Socket.IO presence, live edits, cursor sync
- **JWT auth**: Access + refresh tokens, per-device sessions
- **Version tracking**: Every note has a monotonic version counter
