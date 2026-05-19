# SyncSphere — Project Context

## Stack
- **Frontend**: React 18, TypeScript, Tailwind CSS, Vite, Dexie (IndexedDB), Zustand, Socket.IO-client
- **Backend**: Node.js, Express, TypeScript, Socket.IO, PostgreSQL (pg), JWT

## Key Design Decisions

### Sync Protocol
1. Client batches pending operations from IndexedDB queue
2. POST /api/sync sends ops + lastSyncAt timestamp
3. Server applies ops with conflict detection (version comparison)
4. Server returns appliedOps[], conflictedOps[], serverChanges[]
5. Client acknowledges applied ops, resolves conflicts, upserts server changes

### Conflict Resolution
- Version-aware: if clientVersion < serverVersion → conflict
- Field-level merge: pick longer content (more intentional edit)
- Tags: union merge
- Boolean fields: OR merge
- Fallback: last-write-wins by updated_at

### Offline Queue
- PendingOperation stored in Dexie pendingOps table
- Max 5 retries with exponential backoff (up to 30s)
- Sync triggers: on init, every 30s, on network reconnect, after writes

### WebSocket Events
| Event | Direction | Description |
|-------|-----------|-------------|
| note:join | client→server | Join note room |
| note:edit | client→server | Broadcast delta |
| note:remote_edit | server→client | Remote change |
| cursor:update | client→server | Cursor position |
| presence:update | server→client | Room presence |
| sync:complete | client→server | Notify other devices |
| sync:invalidate | server→client | Pull prompt |

## File Map

| Source file | Destination |
|------------|-------------|
| app.ts | server/src/app.ts |
| index (4).ts | server/src/index.ts |
| auth (1).ts | server/src/middleware/auth.ts |
| auth.controller.ts | server/src/controllers/auth.controller.ts |
| notes.controller.ts | server/src/controllers/notes.controller.ts |
| sync.controller.ts | server/src/controllers/sync.controller.ts |
| auth.service (1).ts | server/src/services/auth.service.ts |
| notes.service (1).ts | server/src/services/notes.service.ts |
| sync.service (1).ts | server/src/services/sync.service.ts |
| index (3).ts | server/src/db/index.ts |
| schema.sql | server/src/db/schema.sql |
| gateway.ts | server/src/websocket/gateway.ts |
| index (1).ts | server/src/routes/index.ts |
| index (2).ts | client/src/types/index.ts |
| db.ts | client/src/storage/db.ts |
| syncEngine.ts | client/src/sync/syncEngine.ts |
| conflictResolver.ts | client/src/sync/conflictResolver.ts |
| socketClient.ts | client/src/websocket/socketClient.ts |

## Environment Variables (server/.env)
```
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://syncsphere:syncsphere@localhost:5432/syncsphere
JWT_SECRET=change-me
JWT_EXPIRES_IN=7d
REFRESH_TOKEN_SECRET=change-refresh
REFRESH_TOKEN_EXPIRES_IN=30d
CLIENT_URL=http://localhost:5173
```

## Running
```bash
# Docker (full stack)
docker compose up -d

# Dev mode
npm run install:all
cp .env.example server/.env
npm run dev
```
