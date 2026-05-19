# SyncSphere — Project Context

## Status: Production-Ready ✅

All features implemented, bugs fixed, deployment configs added.

---

## What Was Fixed (This Session)

| Issue | Fix |
|---|---|
| `api.ts` duplicate exports (`deleteFolder`, `getSyncStatus`, `getOperationHistory`) | Removed duplicate block |
| `offlineQueue.ts` backoff not applied | Added time-based drainability filter using `createdAt` |
| `SyncDashboard` TypeScript `unknown` return | Added `as SyncStatus` cast |
| Dockerfiles concatenated | Split into separate Dockerfile.client + Dockerfile.server |
| `docker-compose.yml` missing build args | Added `VITE_API_URL`/`VITE_WS_URL` build args + healthchecks |
| Missing `.gitignore` for env files | Updated to ignore server/.env and client/.env |
| No GitHub Actions CI | Added `.github/workflows/ci.yml` |
| No deployment config | Added `render.yaml`, `client/vercel.json`, `deploy.yml` |

## What Was Added (This Session)

| Feature | Files |
|---|---|
| Tag chip input in editor | `client/src/components/notes/TagInput.tsx` |
| Tag filter chips in note list | `client/src/components/notes/NoteList.tsx` |
| Presence avatars (colored initials bubbles) | `client/src/components/sync/PresenceAvatars.tsx` |
| Typing indicators in editor | `NoteEditor.tsx` (onRemoteTyping) |
| Remote edit listener | `NoteEditor.tsx` (onRemoteEdit) |
| HTML strip in note preview | `NoteList.tsx` (regex strip `<tags>`) |
| New Note button in list panel | `NoteList.tsx` |
| `nodemon.json` for server dev | `server/nodemon.json` |

---

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    Browser (React + TS)                   │
│                                                           │
│   NoteEditor  ──► Zustand Store  ──► SyncEngine          │
│   (TipTap)         (optimistic)       ├─ OfflineQueue    │
│   NoteList         IndexedDB          ├─ ConflictResolver │
│   TagInput         (Dexie)            └─ REST POST /sync  │
│   PresenceAvatars                                        │
│   TypingIndicator                     Socket.IO Client   │
└────────────────────────┬─────────────────────┬──────────┘
                         │ REST /api            │ WS
                         ▼                      ▼
┌──────────────────────────────────────────────────────────┐
│                Node.js + Express Server                   │
│   AuthCtrl  NotesCtrl  SyncCtrl  WebSocket Gateway       │
└────────────────────────┬─────────────────────────────────┘
                         │
                ┌────────▼────────┐
                │   PostgreSQL     │
                │  users           │
                │  devices         │
                │  notes           │
                │  folders         │
                │  operations      │
                │  sync_state      │
                │  refresh_tokens  │
                └─────────────────┘
```

---

## File Structure (Complete)

```
SyncSphere/
├── .github/
│   └── workflows/
│       ├── ci.yml                  ← TypeScript build check on push
│       └── deploy.yml              ← Render + Vercel auto-deploy on main
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── layout/Sidebar.tsx  ← folders CRUD, nav
│   │   │   ├── notes/
│   │   │   │   ├── NoteEditor.tsx  ← TipTap, presence, typing, tags
│   │   │   │   ├── NoteList.tsx    ← search, tag filter chips, new note btn
│   │   │   │   └── TagInput.tsx    ← chip input, enter/comma to add
│   │   │   └── sync/
│   │   │       ├── SyncIndicator.tsx
│   │   │       └── PresenceAvatars.tsx ← colored initials, multi-user
│   │   ├── hooks/
│   │   │   ├── useNotes.ts
│   │   │   └── useSync.ts
│   │   ├── pages/
│   │   │   ├── AuthPage.tsx        ← login + register tabs
│   │   │   ├── WorkspacePage.tsx   ← view router
│   │   │   ├── TrashPage.tsx       ← restore / permanent delete
│   │   │   ├── SyncDashboard.tsx   ← device table, live stats
│   │   │   └── HistoryPage.tsx     ← operation log, version timeline
│   │   ├── services/api.ts         ← all HTTP calls, token injection
│   │   ├── state/
│   │   │   ├── authStore.ts        ← persisted Zustand auth
│   │   │   └── notesStore.ts       ← notes, folders, UI state
│   │   ├── storage/db.ts           ← Dexie IndexedDB schema
│   │   ├── sync/
│   │   │   ├── syncEngine.ts       ← push/pull orchestrator
│   │   │   ├── offlineQueue.ts     ← backoff-aware drain
│   │   │   └── conflictResolver.ts ← field-level merge
│   │   ├── types/index.ts
│   │   ├── websocket/socketClient.ts
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── index.css               ← TipTap + Tailwind styles
│   ├── vercel.json                 ← Vercel SPA rewrite rule
│   ├── vite.config.ts              ← proxy /api + /socket.io
│   └── package.json
├── server/
│   ├── src/
│   │   ├── controllers/
│   │   │   ├── auth.controller.ts
│   │   │   ├── notes.controller.ts
│   │   │   └── sync.controller.ts
│   │   ├── services/
│   │   │   ├── auth.service.ts
│   │   │   ├── notes.service.ts
│   │   │   └── sync.service.ts
│   │   ├── middleware/auth.ts      ← JWT verify, AuthRequest type
│   │   ├── db/
│   │   │   ├── index.ts            ← pg Pool, query helper, initDB
│   │   │   └── schema.sql          ← full schema with indexes + triggers
│   │   ├── routes/index.ts
│   │   ├── websocket/gateway.ts   ← Socket.IO, presence, rooms
│   │   ├── app.ts                 ← Express + CORS + helmet
│   │   └── index.ts               ← bootstrap, HTTP server
│   ├── nodemon.json
│   ├── tsconfig.json
│   └── package.json
├── docker/
│   ├── Dockerfile.client          ← multi-stage: Node build → Nginx serve
│   └── Dockerfile.server          ← multi-stage: Node build → Node run
├── docker-compose.yml             ← postgres + server + client
├── render.yaml                    ← Render deploy-as-code
├── .gitignore
├── .env.example
├── README.md
└── PROJECT_CONTEXT.md
```

---

## Sync Flow

```
User edits note
     │
     ▼
IndexedDB write (Dexie)        ← immediate, no network needed
Enqueue PendingOperation
_isDirty = true, _syncStatus = 'pending'
     │
 [online?]──No──► persists in IndexedDB, waits
     │ Yes
     ▼
SyncEngine.triggerSync()
  Fires: on init, every 30s, on network 'online' event, after each edit
     │
     ├─ getDrainableOps() — backoff filter (skip if retryCount delay not elapsed)
     ├─ POST /api/sync { deviceId, lastSyncAt, operations[] }
     │
     ▼  Server processes
     ├─ For each op: apply with version check
     ├─ conflict if clientVersion < serverVersion → field-level merge
     ├─ return { appliedOps, conflictedOps, serverChanges, newSyncAt }
     │
     ▼  Client processes response
     ├─ acknowledgeOps → remove from IndexedDB queue
     ├─ upsertNotes(serverChanges) → update IndexedDB (skip if _isDirty + version ≥)
     ├─ resolveConflict locally for unresolved
     └─ setSyncMeta('lastSyncAt', newSyncAt)
```

---

## Conflict Resolution Strategy

**Field-level merge** (both server-side and client-side):

```
title    → pick longer string
content  → pick longer string  
tags     → union merge (Set dedup)
is_starred/is_pinned → OR merge
folder_id → server wins
version   → server version
```

Fallback: `resolveLastWriteWins()` compares `updated_at` timestamps.

The resolved note gets `_syncStatus = 'synced'`, `_isDirty = false`.
The UI shows a "⚠ Field-level merge applied" badge in the editor status bar.

---

## Deployment Checklist

### GitHub Secrets Required
```
RENDER_DEPLOY_HOOK_URL   ← from Render dashboard → Deploy hooks
VERCEL_TOKEN             ← from vercel.com/account/tokens
VITE_API_URL             ← https://your-app.onrender.com/api
VITE_WS_URL              ← https://your-app.onrender.com
```

### Render (Backend)
- Root dir: `server`
- Build: `npm install && npm run build`
- Start: `node dist/index.js`
- Env: DATABASE_URL, JWT_SECRET, REFRESH_TOKEN_SECRET, CLIENT_URL, PORT=3001

### Vercel (Frontend)
- Root dir: `client`
- Framework: Vite
- Env: VITE_API_URL, VITE_WS_URL
- `vercel.json` handles SPA routing (already included)

---

## What To Build Next

1. **Share notes** — invite by email (`note_collaborators` table already in schema)
2. **Mobile responsive** — sidebar slide-over on small screens
3. **Full-text search** — PostgreSQL `tsvector` index + GIN for fast search
4. **Note pinning to top** — UI for `is_pinned` (DB + service already support it)
5. **Export** — download note as Markdown or PDF
