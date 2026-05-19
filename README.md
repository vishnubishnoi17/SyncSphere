# SyncSphere

A **local-first collaborative note-taking workspace** with offline support, real-time sync, and conflict resolution.

[![CI](https://github.com/vishnubishnoi17/SyncSphere/actions/workflows/ci.yml/badge.svg)](https://github.com/vishnubishnoi17/SyncSphere/actions/workflows/ci.yml)

---

## Features

- **Offline-first** — writes go to IndexedDB instantly, sync happens in background
- **Rich text editor** — TipTap with headings, bold/italic/strike, highlight, code blocks, task lists, blockquotes
- **Tags** — chip input per note, filter notes by tag in the list
- **Folders** — create with custom colors, organize notes
- **Sync queue** — pending operations survive page reloads; retry with exponential backoff
- **Conflict resolution** — field-level merge (title, content, tags, starred/pinned) with version vectors
- **Real-time collaboration** — WebSocket presence avatars, typing indicators, live edit broadcast
- **Sync dashboard** — device sessions, pending ops count, conflict history
- **Version history** — per-note operation log with payload preview
- **Trash & restore** — soft delete with recovery

---

## Quick Start (Local)

### Prerequisites
- Node.js 20+
- PostgreSQL 16+ (or use Docker)

### 1. Clone and install
```bash
git clone https://github.com/vishnubishnoi17/SyncSphere.git
cd SyncSphere
npm install
cd client && npm install
cd ../server && npm install
cd ..
```

### 2. Configure environment
```bash
# Server
cp server/.env.example server/.env
# Edit server/.env — set DATABASE_URL, JWT_SECRET, REFRESH_TOKEN_SECRET

# Client (optional — defaults work with local server)
cp client/.env.example client/.env
```

### 3a. Run with Docker (easiest)
```bash
# Starts PostgreSQL + server + client
docker compose up --build
# → http://localhost:5173
```

### 3b. Run locally (with existing Postgres)
```bash
# Terminal 1 — server
cd server && npm run dev

# Terminal 2 — client
cd client && npm run dev

# → http://localhost:5173
```

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Browser (React + TS)                   │
│                                                           │
│   NoteEditor  ──► Zustand Store  ──► SyncEngine          │
│   (TipTap)         (optimistic)       ├─ OfflineQueue    │
│   NoteList         IndexedDB          ├─ ConflictResolver│
│   Sidebar          (Dexie)            └─ REST POST /sync  │
│   Presence                                               │
└────────────────────────┬─────────────────────┬──────────┘
                         │ REST /api            │ Socket.IO
                         ▼                      ▼
┌──────────────────────────────────────────────────────────┐
│                Node.js + Express Server                   │
│                                                           │
│   /auth  /notes  /folders  /sync                         │
│   AuthSvc  NotesSvc  SyncSvc  WebSocket Gateway          │
└────────────────────────────┬─────────────────────────────┘
                             │
                    ┌────────▼────────┐
                    │   PostgreSQL     │
                    │  users, devices  │
                    │  notes, folders  │
                    │  operations log  │
                    │  sync_state      │
                    └─────────────────┘
```

---

## Sync Flow

```
User edits note
     │
     ▼
Write to IndexedDB (immediate)
Enqueue PendingOperation
Mark note _isDirty = true
     │
 [online?]──No──► wait, queue persists
     │ Yes
     ▼
SyncEngine.triggerSync()  (every 30s + on edit + on reconnect)
     │
     ├─ getDrainableOps() — filter by retryCount + backoff delay
     ├─ POST /api/sync { deviceId, lastSyncAt, operations }
     │
     ▼  Server
     ├─ Apply each op (version check → conflict if clientVersion < serverVersion)
     ├─ Field-level merge for conflicts
     ├─ Return { appliedOps, conflictedOps, serverChanges, newSyncAt }
     │
     ▼  Client
     ├─ acknowledgeOps → delete from IndexedDB queue
     ├─ upsertNotes(serverChanges) → update IndexedDB
     ├─ resolveConflict locally for unresolved conflicts
     └─ setSyncMeta('lastSyncAt', newSyncAt)
```

---

## Conflict Resolution

When `clientVersion < serverVersion`, a conflict is detected.

**Field-level merge (default strategy):**

| Field | Strategy |
|---|---|
| `title` | Pick longer string |
| `content` | Pick longer string |
| `tags` | Union merge (deduplicated) |
| `is_starred` | OR merge (if either set it, keep) |
| `is_pinned` | OR merge |
| `folder_id` | Server wins (authoritative) |
| `version` | Server version |

This is implemented in both `server/src/services/sync.service.ts` (server-side) and `client/src/sync/conflictResolver.ts` (client-side for locally-unresolved cases).

**Retry/Backoff:**
```
retryCount 0 → immediate
retryCount 1 → 2s delay
retryCount 2 → 4s delay
retryCount 3 → 8s delay
retryCount 4 → 16s delay
retryCount 5 → max, op dropped
```

---

## WebSocket Events

| Event | Direction | Description |
|---|---|---|
| `note:join` | client→server | Join note collaboration room |
| `note:leave` | client→server | Leave room |
| `note:edit` | client→server | Broadcast delta to room |
| `note:remote_edit` | server→client | Receive remote delta |
| `cursor:update` | client→server | Send cursor position |
| `cursor:remote` | server→client | Receive remote cursor |
| `typing:start/stop` | client→server | Typing indicator |
| `typing:remote` | server→client | Remote typing indicator |
| `presence:update` | server→client | Room member list |
| `sync:complete` | client→server | Notify other devices |
| `sync:invalidate` | server→client | Trigger re-sync on other devices |

---

## API Reference

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | /api/auth/register | ❌ | Create account |
| POST | /api/auth/login | ❌ | Login |
| POST | /api/auth/refresh | ❌ | Refresh access token |
| GET | /api/auth/me | ✅ | User + devices |
| GET | /api/notes | ✅ | List notes |
| GET | /api/notes/search?q= | ✅ | Search |
| GET | /api/notes/:id | ✅ | Get note |
| POST | /api/notes | ✅ | Create note |
| PATCH | /api/notes/:id | ✅ | Update note |
| DELETE | /api/notes/:id | ✅ | Soft delete |
| POST | /api/notes/:id/restore | ✅ | Restore |
| GET | /api/folders | ✅ | List folders |
| POST | /api/folders | ✅ | Create folder |
| DELETE | /api/folders/:id | ✅ | Delete folder |
| POST | /api/sync | ✅ | Main sync (push+pull) |
| GET | /api/sync/status | ✅ | Device sync status |
| GET | /api/sync/history/:noteId | ✅ | Operation log |

---

## Environment Variables

### server/.env
```env
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://user:pass@localhost:5432/syncsphere
JWT_SECRET=min-32-char-secret-change-in-production
JWT_EXPIRES_IN=7d
REFRESH_TOKEN_SECRET=another-min-32-char-secret
REFRESH_TOKEN_EXPIRES_IN=30d
CLIENT_URL=http://localhost:5173
```

### client/.env
```env
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=http://localhost:3001
```

---

## Deployment

### Backend → Render.com

1. Go to [render.com](https://render.com) → New Web Service
2. Connect your GitHub repo
3. Settings:
   - **Root Directory:** `server`
   - **Build:** `npm install && npm run build`
   - **Start:** `node dist/index.js`
4. Add environment variables (DATABASE_URL, JWT_SECRET, REFRESH_TOKEN_SECRET, CLIENT_URL=your-vercel-url)
5. Optional: use `render.yaml` in repo root for infrastructure-as-code

### Frontend → Vercel.com

1. Go to [vercel.com](https://vercel.com) → New Project → Import GitHub repo
2. Settings:
   - **Framework:** Vite
   - **Root Directory:** `client`
   - **Build:** `npm run build`
   - **Output:** `dist`
3. Add env vars: `VITE_API_URL=https://your-render-url.onrender.com/api` and `VITE_WS_URL=https://your-render-url.onrender.com`

### After deploy
- Update `CLIENT_URL` on Render to your Vercel URL
- Redeploy server

### Auto-deploy with GitHub Actions
Set these secrets in GitHub repo settings:
- `RENDER_DEPLOY_HOOK_URL` — from Render dashboard
- `VERCEL_TOKEN` — from Vercel account settings
- `VITE_API_URL` — your Render backend URL + /api
- `VITE_WS_URL` — your Render backend URL

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + TypeScript |
| Rich text | TipTap v2 |
| Styling | Tailwind CSS v3 |
| Build tool | Vite 5 |
| Local DB | Dexie (IndexedDB) |
| State | Zustand 4 |
| WebSocket client | Socket.IO 4 |
| Backend | Node.js 20 + Express + TypeScript |
| Database | PostgreSQL 16 |
| Auth | JWT (7d access + 30d refresh) |
| Container | Docker + Nginx |

---

## Project Structure

```
SyncSphere/
├── .github/workflows/         # CI + deploy
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/Sidebar.tsx
│   │   │   ├── notes/NoteEditor.tsx   # TipTap, tags, presence
│   │   │   ├── notes/NoteList.tsx     # Tag filter chips
│   │   │   ├── notes/TagInput.tsx     # Chip tag input
│   │   │   └── sync/
│   │   │       ├── SyncIndicator.tsx
│   │   │       └── PresenceAvatars.tsx
│   │   ├── hooks/useNotes.ts
│   │   ├── hooks/useSync.ts
│   │   ├── pages/
│   │   │   ├── AuthPage.tsx
│   │   │   ├── WorkspacePage.tsx
│   │   │   ├── TrashPage.tsx
│   │   │   ├── SyncDashboard.tsx
│   │   │   └── HistoryPage.tsx
│   │   ├── services/api.ts
│   │   ├── state/authStore.ts
│   │   ├── state/notesStore.ts
│   │   ├── storage/db.ts              # Dexie IndexedDB
│   │   ├── sync/
│   │   │   ├── syncEngine.ts
│   │   │   ├── offlineQueue.ts        # Backoff-aware drain
│   │   │   └── conflictResolver.ts
│   │   ├── types/index.ts
│   │   └── websocket/socketClient.ts
│   ├── vercel.json
│   └── package.json
├── server/
│   ├── src/
│   │   ├── controllers/
│   │   ├── services/
│   │   ├── middleware/auth.ts
│   │   ├── db/index.ts
│   │   ├── db/schema.sql
│   │   ├── routes/index.ts
│   │   ├── websocket/gateway.ts
│   │   └── index.ts
│   └── package.json
├── docker/
│   ├── Dockerfile.client
│   └── Dockerfile.server
├── docker-compose.yml
├── render.yaml
└── README.md
```
