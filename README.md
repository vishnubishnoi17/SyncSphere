# SyncSphere

A **local-first collaborative note-taking workspace** with offline support, real-time sync, and conflict resolution.

> Notes live on your device first. The server is just another device.

[![CI](https://github.com/vishnubishnoi17/SyncSphere/actions/workflows/ci.yml/badge.svg)](https://github.com/vishnubishnoi17/SyncSphere/actions/workflows/ci.yml)
[![Deploy](https://github.com/vishnubishnoi17/SyncSphere/actions/workflows/deploy.yml/badge.svg)](https://github.com/vishnubishnoi17/SyncSphere/actions/workflows/deploy.yml)

**Live demo:** https://sync-sphere-six.vercel.app

---

## Why SyncSphere?

Most note apps (Google Keep, Notion, OneNote) are cloud-first — sync is bolted on, conflicts silently drop one version, and you lose edits when offline. SyncSphere flips this:

| | Typical note app | SyncSphere |
|---|---|---|
| Offline writes | Lost or stale | Queued locally, always survive |
| Conflict handling | Last-write-wins (silent data loss) | Field-level merge — both edits survive |
| Conflict visibility | Hidden | Shown in conflict history |
| Multi-device presence | None | Live avatars + cursor positions |
| Operation audit trail | None | Full per-note operation log with device + version |

---

## Features

- **Offline-first** — writes go to IndexedDB instantly; sync drains in background
- **Rich text editor** — TipTap with headings, bold/italic/strike, highlight, code blocks, task lists, blockquotes
- **Tags** — chip input per note, filter by tag
- **Folders** — create with custom colors, organize notes
- **Sync queue** — pending operations survive page reloads, retry with exponential backoff
- **Conflict resolution** — field-level merge (title, content, tags, starred/pinned) with version vectors
- **Real-time collaboration** — WebSocket presence avatars, typing indicators, live edit broadcast
- **Sync dashboard** — device sessions, pending ops count, conflict history
- **Version history** — per-note operation log with payload preview
- **Trash & restore** — soft delete with recovery

---

## Quick Start (Local)

### Prerequisites
- Node.js 20+
- PostgreSQL 16+ (or Docker)

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
cp server/.env.example server/.env
# Edit server/.env — set DATABASE_URL, JWT_SECRET, REFRESH_TOKEN_SECRET

cp client/.env.example client/.env
# Defaults work with local server — no changes needed
```

### 3a. Run with Docker (easiest)
```bash
docker compose up --build
# → http://localhost:5173
```

### 3b. Run without Docker
```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
cd client && npm run dev

# → http://localhost:5173
```

---

## Architecture

```mermaid
graph TD
    subgraph Browser["Browser — React + TypeScript (Vercel)"]
        NE["NoteEditor (TipTap)"]
        NL["NoteList / Sidebar"]
        ZS["Zustand Store\noptimistic UI"]
        IDB["IndexedDB (Dexie)\npersistent local store"]
        SE["SyncEngine\n30s interval + on-edit"]
        OQ["OfflineQueue\nbackoff-aware drain"]
        CR["ConflictResolver\nfield-level merge"]
        SC["socketClient\nSocket.IO"]
    end

    subgraph Server["Node.js + Express (Render)"]
        AUTH["/api/auth"]
        NOTES["/api/notes"]
        SYNC["/api/sync"]
        WS["WebSocket Gateway\nSocket.IO"]
        DB[("PostgreSQL\nusers · notes · folders\noperations · sync_state")]
    end

    NE --> ZS --> IDB
    IDB --> SE --> OQ --> SYNC
    SYNC --> CR
    NL --> ZS
    SE --> AUTH
    SC <--> WS
    AUTH --> DB
    NOTES --> DB
    SYNC --> DB
    WS --> DB
```

---

## Full System Workflow

```mermaid
flowchart TD
    A([User opens app]) --> B{accessToken\nin storage?}

    B -- no token --> C[AuthPage\nLogin / Register]
    B -- has token --> D[Verify JWT\nauth.service.ts]

    C --> E[Server returns\naccessToken + deviceId]
    D --> F{Token valid?}
    F -- no --> C
    F -- yes --> G

    E --> G[authStore.login\nSave to Zustand]
    G --> H[Load notes from IndexedDB\nfiltered by user_id]
    H --> I[[WorkspacePage\nnotes rendered]]

    I --> J[Create / Edit note]
    I --> K[Delete / Restore note]
    I --> L[Star / Pin / Tag]

    J & K & L --> M[Write to IndexedDB\ndb.notes.put — immediate]
    M --> N[Enqueue PendingOperation\ndb.pendingOps.put]
    N --> O{Online?}

    O -- offline --> P[(Queue persists\nacross reloads)]
    P -- came back online --> O
    O -- online --> Q[SyncEngine.triggerSync\nskip if already syncing]

    Q --> R[POST /api/sync\nops + lastSyncAt + deviceId]
    R --> S[sync.service.ts\nprocessSync userId req]

    S --> T{clientVersion\nvs server version}
    T -- no conflict --> U[appliedOps\nop removed from queue]
    T -- conflict --> V[conflictedOps\nresolvedNote returned]

    S --> W[getServerChangesSince\npull updates from DB]
    W --> X[upsertNotes\nIndexedDB + Zustand]

    U --> X
    V --> Y[resolveConflict\ntitle · content · tags · starred]
    Y --> X

    X --> Z[setSyncMeta newSyncAt\nlastSyncAt saved locally]

    I -. WebSocket .-> WS1[note:join room]
    WS1 <-. broadcast .-> WS2[gateway.ts\nnotePresence map]
    WS2 -. emit .-> WS3[presence:update\ncursor:remote\nnote:remote_edit]
    WS3 -. received .-> I

    I --> LO([Logout])
    LO --> LC[db.clear all tables\nauthStore.logout]
    LC --> A
```

---

## Sync Flow (Detailed)

```mermaid
sequenceDiagram
    participant U as User
    participant IDB as IndexedDB
    participant SE as SyncEngine
    participant API as POST /api/sync
    participant DB as PostgreSQL

    U->>IDB: edit note (immediate write)
    IDB-->>SE: note marked _isDirty
    SE->>SE: getDrainableOps() — filter by backoff

    alt offline
        SE-->>IDB: wait, queue persists
    else online
        SE->>API: { deviceId, lastSyncAt, operations[] }
        API->>DB: apply each op (version check)

        alt no conflict (clientVersion >= serverVersion)
            DB-->>API: op applied, new version
            API-->>SE: appliedOps: [opId, ...]
            SE->>IDB: removeOp(opId)
        else conflict (clientVersion < serverVersion)
            DB-->>API: conflict detected
            API-->>SE: conflictedOps: [{ opId, resolvedNote }]
            SE->>SE: resolveConflict(local, server)
            SE->>IDB: upsertNote(mergedNote)
        end

        API->>DB: getServerChangesSince(lastSyncAt)
        DB-->>API: serverChanges[]
        API-->>SE: { appliedOps, conflictedOps, serverChanges, newSyncAt }
        SE->>IDB: upsertNotes(serverChanges)
        SE->>IDB: setSyncMeta('lastSyncAt', newSyncAt)
    end
```

---

## Conflict Resolution

When `clientVersion < serverVersion`, a conflict is flagged. The field-level merge strategy means **neither edit is lost**.

```mermaid
flowchart LR
    L[Local note\n_isDirty = true] --> M{resolveConflict}
    S[Server note\nhigher version] --> M

    M --> T[title: pick longer string]
    M --> C[content: pick longer string]
    M --> TG[tags: union merge — deduplicated]
    M --> ST[is_starred: OR merge]
    M --> P[is_pinned: OR merge]
    M --> F[folder_id: server wins]
    M --> V[version: server version]

    T & C & TG & ST & P & F & V --> R[resolvedNote\n_syncStatus = synced]
```

**Retry backoff schedule:**

| retryCount | Delay before next attempt |
|---|---|
| 0 | Immediate |
| 1 | 2s |
| 2 | 4s |
| 3 | 8s |
| 4 | 16s |
| 5 | Dropped (MAX_RETRIES) |

---

## WebSocket Events

```mermaid
sequenceDiagram
    participant C1 as Client A
    participant GW as gateway.ts
    participant C2 as Client B

    C1->>GW: note:join(noteId)
    GW->>C1: presence:update(users[])
    GW->>C2: presence:update(users[])

    C1->>GW: note:edit({ noteId, delta, version })
    GW->>C2: note:remote_edit({ delta, userId })

    C1->>GW: cursor:update({ noteId, cursor })
    GW->>C2: cursor:remote({ userId, cursor, color })

    C1->>GW: typing:start(noteId)
    GW->>C2: typing:remote({ userId, typing: true })

    C1->>GW: sync:complete({ affectedNoteIds })
    GW->>C2: sync:invalidate({ noteIds, fromDevice })

    C1->>GW: note:leave(noteId)
    GW->>C1: presence:update(users[])
    GW->>C2: presence:update(users[])
```

| Event | Direction | Description |
|---|---|---|
| `note:join` | client → server | Join note collaboration room |
| `note:leave` | client → server | Leave room |
| `note:edit` | client → server | Broadcast delta to room |
| `note:remote_edit` | server → client | Receive remote delta |
| `cursor:update` | client → server | Send cursor position |
| `cursor:remote` | server → client | Receive remote cursor |
| `typing:start/stop` | client → server | Typing indicator |
| `typing:remote` | server → client | Remote typing indicator |
| `presence:update` | server → client | Room member list |
| `sync:complete` | client → server | Notify other devices of sync |
| `sync:invalidate` | server → client | Trigger re-sync on other devices |

---

## API Reference

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | ❌ | Create account |
| POST | `/api/auth/login` | ❌ | Login |
| POST | `/api/auth/refresh` | ❌ | Refresh access token |
| GET | `/api/auth/me` | ✅ | User + devices |
| GET | `/api/notes` | ✅ | List notes |
| GET | `/api/notes/search?q=` | ✅ | Full-text search |
| GET | `/api/notes/:id` | ✅ | Get single note |
| POST | `/api/notes` | ✅ | Create note |
| PATCH | `/api/notes/:id` | ✅ | Update note |
| DELETE | `/api/notes/:id` | ✅ | Soft delete |
| POST | `/api/notes/:id/restore` | ✅ | Restore from trash |
| GET | `/api/folders` | ✅ | List folders |
| POST | `/api/folders` | ✅ | Create folder |
| DELETE | `/api/folders/:id` | ✅ | Delete folder |
| POST | `/api/sync` | ✅ | Main sync — push ops + pull changes |
| GET | `/api/sync/status` | ✅ | Device sync status |
| GET | `/api/sync/history/:noteId` | ✅ | Per-note operation log |

---

## Environment Variables

### `server/.env`
```env
PORT=3001
NODE_ENV=development
DATABASE_SSL=false
DATABASE_URL=postgresql://user:pass@localhost:5432/syncsphere
JWT_SECRET=min-32-char-secret-change-in-production
JWT_EXPIRES_IN=7d
REFRESH_TOKEN_SECRET=another-min-32-char-secret
REFRESH_TOKEN_EXPIRES_IN=30d
CLIENT_URL=http://localhost:5173
CLIENT_ORIGINS=http://localhost:5173
```

### `client/.env`
```env
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=http://localhost:3001
```

---

## Deployment

### Backend → Render.com

1. New Web Service → connect GitHub repo
2. Settings:
   - **Root Directory:** `server`
   - **Build command:** `npm ci --include=dev && npm run build`
   - **Start command:** `node dist/index.js`
   - **Health check path:** `/health`
3. Environment variables to set in Render dashboard:

```env
NODE_ENV=production
DATABASE_URL=<your neon/supabase/render postgres url>
DATABASE_SSL=true
JWT_SECRET=<strong 32+ char secret>
REFRESH_TOKEN_SECRET=<another strong secret>
CLIENT_URL=https://sync-sphere-six.vercel.app
CLIENT_ORIGINS=https://sync-sphere-six.vercel.app
```

Or use the included `render.yaml` for infrastructure-as-code.

### Frontend → Vercel

1. Import repo → set **Root Directory** to `client`
2. Environment variables in Vercel dashboard:

```env
VITE_API_URL=https://your-render-service.onrender.com/api
VITE_WS_URL=https://your-render-service.onrender.com
```

3. The included `client/vercel.json` handles SPA routing — no changes needed.

### GitHub Actions (CI/CD)

- `ci.yml` — builds client + server on every push and PR
- `deploy.yml` — triggers Render + Vercel deploy hooks on push to `main`

Optional secrets in repo Settings → Secrets:
```
RENDER_DEPLOY_HOOK_URL
VERCEL_DEPLOY_HOOK_URL
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + TypeScript |
| Rich text editor | TipTap v2 |
| Styling | Tailwind CSS v3 |
| Build tool | Vite 5 |
| Local database | Dexie (IndexedDB wrapper) |
| State management | Zustand 4 |
| WebSocket client | Socket.IO 4 |
| Backend runtime | Node.js 20 + Express + TypeScript |
| Database | PostgreSQL 16 |
| Auth | JWT — 7d access token + 30d refresh token |
| Deployment | Vercel (client) + Render (server) |
| Containers | Docker + Docker Compose (local dev) |

---

## Database Schema

```mermaid
erDiagram
    users ||--o{ notes : owns
    users ||--o{ folders : owns
    users ||--o{ devices : has
    users ||--o{ refresh_tokens : has
    folders ||--o{ notes : contains
    notes ||--o{ operations : logs
    devices ||--o{ sync_state : tracks
    devices ||--o{ operations : from

    users {
        uuid id PK
        varchar email
        text password_hash
        varchar name
        timestamptz created_at
    }
    notes {
        uuid id PK
        uuid user_id FK
        uuid folder_id FK
        text title
        text content
        text[] tags
        boolean is_starred
        boolean is_pinned
        bigint version
        boolean deleted
        timestamptz updated_at
    }
    operations {
        uuid id PK
        uuid note_id FK
        uuid user_id FK
        uuid device_id FK
        varchar operation_type
        jsonb payload
        bigint base_version
        bigint result_version
        boolean conflict
        timestamptz timestamp
    }
    sync_state {
        uuid id PK
        uuid user_id FK
        uuid device_id FK
        timestamptz last_sync_at
    }
```

---

## Project Structure

```
SyncSphere/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # Build check on every push/PR
│       └── deploy.yml             # Trigger Render + Vercel on main
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/Sidebar.tsx
│   │   │   ├── notes/NoteEditor.tsx      # TipTap rich text + tags + presence
│   │   │   ├── notes/NoteList.tsx        # Tag filter chips
│   │   │   ├── notes/TagInput.tsx        # Chip tag input
│   │   │   └── sync/
│   │   │       ├── SyncIndicator.tsx
│   │   │       └── PresenceAvatars.tsx
│   │   ├── hooks/
│   │   │   ├── useNotes.ts               # CRUD + optimistic updates
│   │   │   └── useSync.ts                # SyncEngine lifecycle
│   │   ├── pages/
│   │   │   ├── AuthPage.tsx
│   │   │   ├── WorkspacePage.tsx
│   │   │   ├── TrashPage.tsx
│   │   │   ├── SyncDashboard.tsx
│   │   │   └── HistoryPage.tsx
│   │   ├── services/api.ts               # Typed fetch wrappers
│   │   ├── state/
│   │   │   ├── authStore.ts              # Zustand auth state
│   │   │   └── notesStore.ts             # Zustand notes + UI state
│   │   ├── storage/db.ts                 # Dexie IndexedDB schema + helpers
│   │   ├── sync/
│   │   │   ├── syncEngine.ts             # Core sync orchestrator
│   │   │   ├── offlineQueue.ts           # Backoff-aware op drain
│   │   │   └── conflictResolver.ts       # Field-level merge
│   │   ├── types/index.ts
│   │   └── websocket/socketClient.ts
│   ├── vercel.json                        # SPA rewrite rules
│   └── package.json
├── server/
│   ├── src/
│   │   ├── controllers/                   # Route handlers
│   │   ├── services/
│   │   │   ├── auth.service.ts
│   │   │   ├── notes.service.ts
│   │   │   └── sync.service.ts            # processSync — core sync logic
│   │   ├── middleware/auth.ts             # JWT verify middleware
│   │   ├── db/
│   │   │   ├── index.ts                   # pg Pool + initDB
│   │   │   └── schema.sql                 # Full DDL with indexes + triggers
│   │   ├── routes/index.ts
│   │   ├── websocket/gateway.ts           # Socket.IO presence + broadcast
│   │   ├── config/env.ts                  # Typed env with production checks
│   │   └── index.ts
│   └── package.json
├── docker/
│   ├── Dockerfile.client
│   └── Dockerfile.server
├── docker-compose.yml
├── render.yaml                            # Render IaC config
└── README.md
```

---

## Known Issues & Roadmap

- [ ] `authStore.logout()` must call `db.clear()` — currently notes from previous user persist in IndexedDB across account switches
- [ ] `offlineQueue` backoff uses `createdAt` as last-attempt proxy — needs a `lastAttemptAt` field for accurate retry timing
- [ ] No 401 interceptor — expired access tokens require manual re-login instead of auto-refresh
- [ ] `initDB` runs full schema DDL on every server start — migrate to `node-pg-migrate` for production

---

## License

MIT