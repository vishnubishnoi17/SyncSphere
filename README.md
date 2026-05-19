# SyncSphere

**Local-first collaborative workspace** with real-time sync, offline support, and conflict resolution.

> Built to demonstrate distributed systems thinking: offline-first architecture, operational logging, field-level conflict resolution, and eventual consistency.

---

## Architecture

```
┌─────────────────────────────────────────────┐
│              React Client                    │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐ │
│  │  TipTap  │ │ Zustand  │ │  Socket.IO  │ │
│  │  Editor  │ │  Store   │ │   Client    │ │
│  └──────────┘ └──────────┘ └─────────────┘ │
│  ┌──────────────────────────────────────┐   │
│  │           IndexedDB (Dexie)          │   │
│  │  notes | folders | pendingOps        │   │
│  └──────────────────────────────────────┘   │
│  ┌──────────────────────────────────────┐   │
│  │           SyncEngine                 │   │
│  │  offlineQueue → push → pull → merge  │   │
│  └──────────────────────────────────────┘   │
└─────────────────┬───────────────────────────┘
                  │ HTTP REST + WebSocket
┌─────────────────▼───────────────────────────┐
│              Node.js + Express               │
│  ┌──────────┐ ┌──────────┐ ┌─────────────┐ │
│  │   Auth   │ │   Sync   │ │  Socket.IO  │ │
│  │ Service  │ │ Service  │ │   Gateway   │ │
│  └──────────┘ └──────────┘ └─────────────┘ │
└─────────────────┬───────────────────────────┘
                  │
┌─────────────────▼───────────────────────────┐
│            PostgreSQL (Neon)                 │
│  users | notes | folders | operations        │
│  devices | sync_state | refresh_tokens       │
└─────────────────────────────────────────────┘
```

## Sync Flow

```
User edits note
      │
      ▼
IndexedDB updated instantly  ← optimistic update
      │
      ▼
Operation enqueued in pendingOps
      │
      ├── Online? ──► POST /api/sync (push ops + pull changes)
      │                    │
      │                    ├── Server applies ops
      │                    ├── Conflict detected? → field-level merge
      │                    └── Returns server changes since lastSyncAt
      │
      └── Offline? → ops stay in queue, retry on reconnect (exponential backoff)
```

## Conflict Resolution

```
Device A (offline)          Device B (online)
  edits title                 edits content
       │                           │
       └──────── both sync ─────────┘
                      │
              Version mismatch detected
                      │
              Field-level merge:
                title  ← Device A (newer timestamp)
                content ← Device B (longer wins)
                      │
              Consistent state stored
              Operations log updated with conflict=true
```

## Quick Start

### Prerequisites
- Node.js 18+
- PostgreSQL (or Neon free cloud DB)

### 1. Clone and install
```bash
git clone https://github.com/vishnubishnoi17/SyncSphere.git
cd SyncSphere
npm run install:all
```

### 2. Configure environment
```bash
cp .env.example server/.env
# Edit server/.env — set DATABASE_URL to your Neon connection string
```

```bash
# client/.env
echo "VITE_API_URL=http://localhost:3001/api" > client/.env
echo "VITE_WS_URL=http://localhost:3001" >> client/.env
```

### 3. Run
```bash
npm run dev
# Client: http://localhost:5173
# Server: http://localhost:3001
```

### 4. Docker (optional)
```bash
docker compose up -d
```

## Features

| Feature | Description |
|---|---|
| **Offline-first** | All writes go to IndexedDB immediately, no server needed |
| **Sync engine** | Push/pull with exponential backoff retry on failure |
| **Conflict resolution** | Field-level merge — title and content resolved independently |
| **Real-time** | Socket.IO presence, live edits, cursor sync, typing indicators |
| **Rich text editor** | TipTap — bold, italic, headings, lists, tasks, code blocks |
| **Folders** | Create/delete folders with color coding |
| **Trash** | Soft delete with restore and permanent delete |
| **Operation history** | Every write immutably logged — full audit trail |
| **Sync dashboard** | Live view of all devices, sync state, conflict count |
| **JWT auth** | Access + refresh tokens, per-device session tracking |
| **Version tracking** | Monotonic version counter on every note |

## API Routes

```
POST   /api/auth/register
POST   /api/auth/login
POST   /api/auth/refresh
GET    /api/auth/me

GET    /api/notes
GET    /api/notes/search?q=
GET    /api/notes/:id
POST   /api/notes
PATCH  /api/notes/:id
DELETE /api/notes/:id
POST   /api/notes/:id/restore

GET    /api/folders
POST   /api/folders
DELETE /api/folders/:id

POST   /api/sync
GET    /api/sync/status
GET    /api/sync/history/:noteId
```

## WebSocket Events

```
Client → Server          Server → Client
─────────────────        ───────────────────────
note:join                note:remote_edit
note:leave               cursor:remote
note:edit                typing:remote
cursor:update            presence:update
typing:start             sync:invalidate
typing:stop
sync:complete
```

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 18 + TypeScript |
| Rich text | TipTap v2 |
| Styling | Tailwind CSS v3 |
| Build | Vite 5 |
| Local DB | Dexie (IndexedDB) |
| State | Zustand |
| WebSocket client | Socket.IO-client |
| Backend | Node.js + Express + TypeScript |
| WebSocket server | Socket.IO |
| Database | PostgreSQL 16 (Neon) |
| Auth | JWT (access 7d + refresh 30d) |

## Scalability Discussion

At 1M+ users, the following optimizations apply:
- **Redis** — cache hot notes, pub/sub for cross-server WebSocket events
- **Horizontal scaling** — stateless API servers behind load balancer
- **WebSocket gateway** — dedicated Socket.IO cluster with Redis adapter
- **Kafka** — event streaming for operation log at scale
- **DB partitioning** — shard `notes` and `operations` by `user_id`
- **CDN** — static assets, edge caching for read-heavy endpoints

## Project Structure

```
SyncSphere/
├── client/src/
│   ├── components/
│   │   ├── layout/Sidebar.tsx      # nav, folders, trash, sync dashboard
│   │   ├── notes/NoteEditor.tsx    # TipTap rich text editor
│   │   ├── notes/NoteList.tsx      # note list with search
│   │   └── sync/SyncIndicator.tsx  # sync status badge
│   ├── pages/
│   │   ├── AuthPage.tsx
│   │   ├── WorkspacePage.tsx       # main shell, view routing
│   │   ├── TrashPage.tsx           # deleted notes + restore
│   │   ├── SyncDashboard.tsx       # device/sync status
│   │   └── HistoryPage.tsx         # operation log / time travel
│   ├── sync/
│   │   ├── syncEngine.ts           # push/pull orchestration
│   │   ├── offlineQueue.ts         # pending op queue + backoff
│   │   └── conflictResolver.ts     # field-level merge logic
│   ├── storage/db.ts               # Dexie IndexedDB schema
│   ├── websocket/socketClient.ts   # Socket.IO client wrapper
│   └── state/                      # Zustand stores
└── server/src/
    ├── services/
    │   ├── sync.service.ts         # core sync + conflict resolution
    │   ├── notes.service.ts        # CRUD + operation logging
    │   └── auth.service.ts         # JWT + device tracking
    ├── websocket/gateway.ts        # Socket.IO: presence, cursors
    └── db/schema.sql               # full PostgreSQL schema
```
