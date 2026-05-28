# SyncSphere

A local-first collaborative notes workspace built for unreliable networks, multiple devices, and conflict-heavy editing.

> Notes are written to your device first, synced in the background, and merged carefully when two devices diverge.

[![CI](https://github.com/vishnubishnoi17/SyncSphere/actions/workflows/ci.yml/badge.svg)](https://github.com/vishnubishnoi17/SyncSphere/actions/workflows/ci.yml)
[![Deploy](https://github.com/vishnubishnoi17/SyncSphere/actions/workflows/deploy.yml/badge.svg)](https://github.com/vishnubishnoi17/SyncSphere/actions/workflows/deploy.yml)

**Live demo:** https://sync-sphere-six.vercel.app

---

## What SyncSphere Does

SyncSphere is a full-stack note-taking app where the browser is treated like a real data owner, not just a thin client. The app stores notes in IndexedDB, queues writes when offline, syncs changes to PostgreSQL when connectivity returns, and keeps a per-note operation log for visibility into what happened.

It is designed around three practical goals:

1. **You can keep working offline.** Creating, editing, tagging, starring, pinning, and deleting notes all update locally first.
2. **You can move between devices.** The sync engine pushes local operations and pulls remote changes for the signed-in account.
3. **You do not silently lose edits.** When devices race, SyncSphere records the conflict and applies field-level merge behavior instead of blindly overwriting data.

---

## Why This App Exists

Many note apps are cloud-first. They assume constant connectivity, make the server the only source of truth, and often fall back to last-write-wins behavior that hides conflicts from the user.

SyncSphere takes the opposite approach:

| | Typical cloud-first notes app | SyncSphere |
|---|---|---|
| Write path | Browser waits on backend | Browser writes immediately to IndexedDB |
| Offline support | Limited or fragile | Pending operations persist locally |
| Sync model | Save document snapshots | Replay operation queue + pull changes |
| Conflicts | Often silent overwrite | Logged and surfaced as merge/conflict state |
| Device awareness | Rare | Device sessions and last sync timestamps |
| Collaboration signals | Sometimes comments only | Live presence, typing, remote edit broadcasts |
| Auditability | Minimal | Per-note operation history with payload preview |

---

## Feature Overview

- **Account-based workspace isolation** with register, login, JWT auth, refresh tokens, and per-device session tracking
- **Local-first notes** stored in IndexedDB with optimistic updates and fast startup from local cache
- **Rich note editing** with TipTap formatting, task lists, code blocks, highlights, headings, quotes, undo, and redo
- **Search and organization** through folders, starred notes, tags, pinned ordering, and inline search
- **Reliable offline queue** that keeps pending operations across reloads and retries failed sync attempts with backoff
- **Two-way sync engine** that pushes local operations, pulls remote changes, and tracks per-device `lastSyncAt`
- **Conflict-aware updates** with field-level merge behavior and conflict visibility in note status/history
- **Real-time collaboration cues** with presence avatars, typing indicators, live edit broadcasts, and cross-device invalidation events
- **Visibility tooling** through a sync dashboard and per-note operation history
- **Trash and restore flow** for soft deletion with recovery
- **Deployment-ready setup** for Vercel, Render, Docker Compose, and GitHub Actions

---

## Feature Deep Dive

### 1. Authentication and device identity

Users can sign up and sign in with email, password, and display name. Every login/register call also creates or updates a device session, so sync activity can be tracked per device instead of only per account.

What this enables:

- Separate local cache boundaries for different signed-in accounts
- Device-aware sync metadata in the dashboard
- Device names shown in operation history
- JWT-protected REST and WebSocket access

The current auth flow supports:

- `POST /api/auth/register`
- `POST /api/auth/login`
- `POST /api/auth/refresh`
- `GET /api/auth/me`

### 2. Local-first note creation and editing

Creating a note does not depend on the network. The client generates a UUID, writes the note into IndexedDB, marks it dirty, enqueues a pending operation, updates Zustand state, and then asks the sync engine to drain when possible.

Editing behaves the same way:

- Title edits are saved on a debounce
- Rich text content is stored as HTML from TipTap
- Tags are written locally and synced as structured arrays
- Starred and pinned flags are normal note fields
- Sync status is surfaced directly in the editor and note list

This gives the app a "save locally now, reconcile later" feel instead of a "wait for the backend" feel.

### 3. Rich text editor

The note editor supports:

- Bold
- Italic
- Strike
- Highlight
- Inline code
- H1, H2, H3 headings
- Bullet lists
- Ordered lists
- Task lists
- Blockquotes
- Code blocks
- Undo and redo
- Live word and character counts

Each note also shows:

- Sync state
- Conflict badge when a merge happened
- Current version number
- Last updated timestamp
- Folder metadata
- Presence avatars for other viewers

### 4. Note discovery and organization

The workspace is organized around quick filtering rather than heavy workspace ceremony.

Users can:

- Open **All Notes**
- Switch to **Starred**
- Filter into a **folder**
- Search notes by title/content
- Filter by tag chip
- Create color-coded folders
- Delete folders while automatically unfoldering the notes inside

Note ordering is a combination of local cache ordering and server ordering. On the backend, notes are returned with pinned notes first and then most recently updated notes.

### 5. Tags

Tags are lightweight and keyboard-friendly:

- Enter, comma, or space commits a tag
- Tags are normalized to lowercase
- Non-alphanumeric characters are stripped except `-`
- Duplicate tags are prevented
- A note can currently hold up to 8 tags

Tags appear:

- Inside the note editor
- In the note list preview
- As quick filters across loaded notes

### 6. Folders

Folders are simple user-owned records with a name and color. They are fetched from the server and cached locally.

Folder behavior today:

- Create folders from the sidebar
- Choose from preset colors
- Assign notes by saving `folder_id`
- Delete folders without deleting the notes
- Display folder name/color in the editor footer

### 7. Trash and restore

Deleting a note is soft-delete by default. The note is marked `deleted = true`, removed from the active notes list, and shown in the Trash view.

Users can:

- Review deleted notes
- Restore a note back into the workspace
- Permanently remove a note from the local cache from the Trash screen

Current nuance:

- Restore is server-backed and then mirrored locally
- "Delete forever" on the Trash screen currently removes the local copy only; permanent server-side hard deletion is not part of the REST API yet

### 8. Offline queue and retry behavior

Every local write becomes a pending operation. Those operations are stored in IndexedDB so they survive tab refreshes and browser restarts.

The queue supports:

- Create
- Update
- Delete
- Restore

Retry behavior uses exponential-style backoff:

| retryCount | Delay before next attempt |
|---|---|
| 0 | Immediate |
| 1 | 2s |
| 2 | 4s |
| 3 | 8s |
| 4 | 16s |
| 5 | Dropped (`MAX_RETRIES`) |

### 9. Sync engine

The sync engine runs in the browser and coordinates push/pull behavior.

What it does:

- Initializes after auth when `accessToken` and `deviceId` are available
- Loads the device-specific `lastSyncAt` timestamp from IndexedDB
- Triggers an immediate sync on startup
- Retries sync on a 30-second interval while online
- Triggers sync again when the browser comes back online
- Sends pending operations to `POST /api/sync`
- Removes acknowledged operations from the queue
- Applies pulled server changes into IndexedDB
- Updates UI-level sync state in Zustand

The manual sync button in the top bar uses the same engine.

### 10. Conflict handling

SyncSphere does not only detect version mismatches. It also records them and tries to keep both sides of the user's work.

Current field-level merge rules:

- `title`: longer string wins
- `content`: longer string wins
- `tags`: union merge with deduplication
- `is_starred`: boolean OR merge
- `is_pinned`: boolean OR merge
- `folder_id`: server value wins
- `version`: server version is retained in the resolved note

What users see:

- Conflict state on the note
- "Field-level merge applied" badge in the editor
- Conflict counts in the Sync Dashboard
- Conflict markers in operation history

### 11. Operation history and audit trail

Every server-applied note change is logged as an operation record. The History view for a note shows:

- Operation type
- Payload preview
- Timestamp
- Base version
- Result version
- Conflict flag
- Device name when available

This makes the sync model inspectable instead of hidden.

### 12. Real-time collaboration signals

WebSockets are used for awareness and lightweight collaboration broadcasts.

What users get today:

- Presence avatars when multiple people are viewing the same note
- Typing indicators
- Remote edit event broadcasts
- Remote cursor event support at the socket layer
- Cross-device invalidation event support after sync

Important implementation note:

- Presence and typing are visible in the current UI
- Remote edit and cursor events exist in the socket protocol, but the editor UI does not yet render remote cursor positions or CRDT-style live document merging

### 13. Sync dashboard

The Sync Dashboard is the app's operational control panel. It combines local IndexedDB stats with server-reported sync status.

It shows:

- Total locally cached notes
- Current local pending operation count
- Total historical conflicts for the account
- Registered device sessions
- Last seen time per device
- Last sync timestamp per device when available
- Pending op count per device when available

### 14. Responsive workspace

The workspace supports both desktop and mobile layouts:

- Sidebar becomes an overlay drawer on mobile
- List and editor become separate panes on smaller screens
- Top bar exposes navigation and sync status
- Desktop keeps list/editor side by side

### 15. Deployment and operations

The repo already includes:

- Vercel configs for the client
- Render deployment guidance and `render.yaml`
- Dockerfiles for client and server
- Docker Compose for local full-stack startup
- GitHub Actions for CI and deploy hooks

---

## Quick Start

### Prerequisites

- Node.js 20+
- PostgreSQL 16+ or Docker

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
# Edit server/.env with your database and JWT secrets

cp client/.env.example client/.env
# Local defaults are already suitable for the standard dev setup
```

### 3. Run with Docker

```bash
docker compose up --build
```

Client: `http://localhost:5173`

### 4. Run without Docker

```bash
# Terminal 1
cd server && npm run dev

# Terminal 2
cd client && npm run dev
```

Client: `http://localhost:5173`

### 5. Useful commands

```bash
# repo root
npm run dev
npm run build
npm test

# client only
cd client && npm run dev
cd client && npm run build
cd client && npm test

# server only
cd server && npm run dev
cd server && npm run build
```

---

## User Journey

1. A user signs up or signs in.
2. The workspace loads notes from IndexedDB for instant local rendering.
3. The app refreshes notes/folders from the backend when available.
4. The user creates or edits notes locally.
5. Each change is stored in IndexedDB and queued as an operation.
6. The sync engine pushes those operations to the server.
7. The server applies operations, logs them, and returns remote changes.
8. The client merges pulled changes back into local storage.
9. Presence, typing, and cross-device notifications travel over WebSockets while the user is active.

---

## Architecture

This diagram shows the main building blocks of the browser and server. Read it left to right: editor and UI state write to IndexedDB first, then the sync engine and offline queue decide when data should cross the network.

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

What each block represents:

- `NoteEditor`, `NoteList`, and `Sidebar` are the primary user-facing surfaces
- `Zustand Store` holds active note, filters, sync state, and auth-backed UI state
- `IndexedDB` is the durable local cache for notes, folders, pending operations, and sync metadata
- `SyncEngine` controls scheduled sync, online/offline transitions, and push/pull orchestration
- `OfflineQueue` ensures failed operations are retried rather than discarded
- `ConflictResolver` applies client-side merge rules when needed
- `socketClient` carries presence, typing, edit, cursor, and invalidation events
- Express routes separate auth, notes, and sync concerns
- PostgreSQL stores the durable account-wide record of notes, folders, devices, sync state, and operations

---

## Full System Workflow

This workflow diagram is the end-to-end story of a normal session: authenticate, load local notes, edit locally, enqueue operations, sync when possible, merge if necessary, and then broadcast awareness events.

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

How to read it:

- The browser always tries local persistence first
- Sync is conditional on connectivity and non-busy state
- The server both applies outbound operations and sends inbound changes
- WebSocket activity is parallel to REST sync; it is for awareness and near-real-time signals, not the source of truth for persistence

---

## Sync Flow

This sequence focuses on one editing cycle. It is the best diagram to look at when you want to understand exactly how an offline write becomes a synced server record.

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

Important details behind this diagram:

- Pending operations are filtered by retry/backoff eligibility before each sync attempt
- The sync endpoint is both a push endpoint and a pull endpoint
- The browser keeps device-scoped sync metadata locally
- Operations are only removed from the queue when the server acknowledges them

---

## Conflict Resolution

This diagram summarizes the merge strategy SyncSphere uses when local and server versions disagree.

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

Interpretation:

- Text-heavy fields preserve the more information-dense value by favoring the longer string
- Tag and boolean fields are merged to keep intent from both devices
- Folder assignment currently defers to the server record
- The final resolved note is written back as synced state

---

## WebSocket Events

This diagram describes note-room collaboration traffic. It is about awareness and lightweight broadcasting, not hard persistence.

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
| `note:join` | client -> server | Join a note-specific collaboration room |
| `note:leave` | client -> server | Leave that room |
| `note:edit` | client -> server | Broadcast a lightweight edit signal to peers |
| `note:remote_edit` | server -> client | Inform peers that another user edited the note |
| `cursor:update` | client -> server | Send cursor coordinates |
| `cursor:remote` | server -> client | Receive another user's cursor coordinates |
| `typing:start` / `typing:stop` | client -> server | Emit typing state |
| `typing:remote` | server -> client | Receive another user's typing state |
| `presence:update` | server -> client | Receive the current room participant list |
| `sync:complete` | client -> server | Notify the server that sync affected notes changed |
| `sync:invalidate` | server -> client | Tell sibling devices to refresh affected notes |

---

## Screens and Views

### Auth screen

- Sign in and sign up in the same flow
- Displays the local-first positioning of the product
- Resets local workspace data when switching between users

### Main workspace

- Desktop split-pane layout with sidebar, note list, and editor
- Mobile overlay navigation with separate list/editor panes
- Top-level sync indicator always available

### Sidebar

- All Notes
- Starred
- Trash
- Sync Dashboard
- Folder creation and deletion
- New note entry point
- Logged-in user identity and logout

### Note list

- Search by title/content
- Quick tag filtering
- Active note highlight
- Preview text
- Date labels
- Pending/conflict/star indicators

### Note editor

- Rich text content editing
- Title editing
- History button
- Star toggle
- Delete-to-trash action
- Presence avatars
- Typing status
- Version and count metadata

### Trash

- Review deleted notes
- Restore from trash
- Delete forever from the local cache

### Sync Dashboard

- Note count
- Pending queue count
- Conflict count
- Device inventory
- Last seen/synced device timestamps

### History view

- Timeline of operations
- Conflict markers
- Payload previews
- Version transitions
- Device attribution

---

## API Reference

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/register` | No | Register a user and return auth tokens plus device identity |
| POST | `/api/auth/login` | No | Authenticate and return auth tokens plus device identity |
| POST | `/api/auth/refresh` | No | Exchange a refresh token for a new access token |
| GET | `/api/auth/me` | Yes | Return user identity plus known devices |
| GET | `/api/notes` | Yes | List account notes, excluding deleted notes by default |
| GET | `/api/notes/search?q=` | Yes | Search note title/content |
| GET | `/api/notes/:id` | Yes | Fetch a single note |
| POST | `/api/notes` | Yes | Create a note directly on the server |
| PATCH | `/api/notes/:id` | Yes | Update a note and log an operation |
| DELETE | `/api/notes/:id` | Yes | Soft-delete a note |
| POST | `/api/notes/:id/restore` | Yes | Restore a soft-deleted note |
| GET | `/api/folders` | Yes | List user folders |
| POST | `/api/folders` | Yes | Create a folder |
| DELETE | `/api/folders/:id` | Yes | Soft-delete a folder and unassign its notes |
| POST | `/api/sync` | Yes | Push pending operations and pull server changes |
| GET | `/api/sync/status` | Yes | Fetch device and conflict summary |
| GET | `/api/sync/history/:noteId` | Yes | Fetch recent operation history for a note |

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

### Backend on Render

1. Create a new Web Service and connect the repo.
2. Set **Root Directory** to `server`.
3. Use the build command `npm ci --include=dev && npm run build`.
4. Use the start command `node dist/index.js`.
5. Set the health check path to `/health`.

Production environment variables:

```env
NODE_ENV=production
DATABASE_URL=<your postgres url>
DATABASE_SSL=true
JWT_SECRET=<strong 32+ char secret>
REFRESH_TOKEN_SECRET=<another strong secret>
CLIENT_URL=https://sync-sphere-six.vercel.app
CLIENT_ORIGINS=https://sync-sphere-six.vercel.app
```

`render.yaml` is included if you want infrastructure-as-code.

### Frontend on Vercel

1. Import the repo.
2. Keep the root at the repository root and let `vercel.json` build `client/`, or set the Vercel root directly to `client`.
3. Configure:

```env
VITE_API_URL=https://your-render-service.onrender.com/api
VITE_WS_URL=https://your-render-service.onrender.com
```

4. Keep the backend on a long-running Node host because Socket.IO and PostgreSQL pooling are not a good fit for Vercel serverless functions.

### GitHub Actions

- `ci.yml` builds the client and server and runs client tests on push and pull request
- `deploy.yml` triggers deploy hooks on pushes to `main`

Optional repository secrets:

```text
RENDER_DEPLOY_HOOK_URL
VERCEL_DEPLOY_HOOK_URL
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend framework | React 18 + TypeScript |
| Editor | TipTap v2 |
| Styling | Tailwind CSS |
| Build tool | Vite 5 |
| Client state | Zustand |
| Local persistence | Dexie over IndexedDB |
| Realtime transport | Socket.IO |
| Backend runtime | Node.js 20 + Express |
| Backend language | TypeScript |
| Database | PostgreSQL |
| Auth | JWT access + refresh tokens |
| Testing | Jest + ts-jest |
| Local containers | Docker + Docker Compose |
| Hosting | Vercel for client, Render for server |

---

## Database Schema

This ER diagram shows the durable server-side model. It is useful when you want to understand how devices, notes, folders, operations, and sync state relate to one another.

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

What it means in practice:

- `users` own all workspace data
- `devices` let the system track session activity and sync progress per device
- `notes` are the main editable objects
- `folders` provide organization but do not own notes strongly enough to delete them on folder removal
- `operations` are the audit trail and conflict evidence
- `sync_state` stores per-user/per-device sync checkpoints

---

## Project Structure

```text
SyncSphere/
├── .github/
│   └── workflows/
│       ├── ci.yml                 # Build check on every push/PR
│       └── deploy.yml             # Trigger Render + Vercel on main
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/Sidebar.tsx
│   │   │   ├── notes/NoteEditor.tsx
│   │   │   ├── notes/NoteList.tsx
│   │   │   ├── notes/TagInput.tsx
│   │   │   └── sync/
│   │   │       ├── SyncIndicator.tsx
│   │   │       └── PresenceAvatars.tsx
│   │   ├── hooks/
│   │   │   ├── useNotes.ts
│   │   │   └── useSync.ts
│   │   ├── pages/
│   │   │   ├── AuthPage.tsx
│   │   │   ├── WorkspacePage.tsx
│   │   │   ├── TrashPage.tsx
│   │   │   ├── SyncDashboard.tsx
│   │   │   ├── HistoryPage.tsx
│   │   │   └── ConflictDemo.tsx
│   │   ├── services/api.ts
│   │   ├── state/
│   │   │   ├── authStore.ts
│   │   │   └── notesStore.ts
│   │   ├── storage/db.ts
│   │   ├── sync/
│   │   │   ├── syncEngine.ts
│   │   │   ├── offlineQueue.ts
│   │   │   └── conflictResolver.ts
│   │   ├── types/index.ts
│   │   └── websocket/socketClient.ts
│   ├── jest.config.cjs
│   ├── vercel.json
│   └── package.json
├── server/
│   ├── src/
│   │   ├── controllers/
│   │   ├── services/
│   │   │   ├── auth.service.ts
│   │   │   ├── notes.service.ts
│   │   │   └── sync.service.ts
│   │   ├── middleware/auth.ts
│   │   ├── db/
│   │   │   ├── index.ts
│   │   │   └── schema.sql
│   │   ├── routes/index.ts
│   │   ├── websocket/gateway.ts
│   │   ├── config/env.ts
│   │   └── index.ts
│   └── package.json
├── docker/
│   ├── Dockerfile.client
│   └── Dockerfile.server
├── docker-compose.yml
├── render.yaml
└── README.md
```

---

## Current Limitations

- WebSocket remote edit events are broadcast, but the editor does not yet perform true multiplayer document merging or render remote cursors in the UI.
- Access token refresh exists at the API layer, but the client does not yet have a full automatic 401 recovery interceptor.
- Trash "Delete forever" currently removes the note from the local cache only; there is no dedicated permanent-delete backend endpoint.
- Retry timing is backoff-aware, but queue bookkeeping could be improved further with an explicit `lastAttemptAt` field.
- Search is basic title/content matching rather than a dedicated full-text search index.

---

## License

MIT
