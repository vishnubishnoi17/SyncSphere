# SyncSphere — Project Context
> Last updated: Session 2 — All features complete

---

## Status: FULLY COMPLETE ✅

All phases done. App running at localhost:5173 with Neon PostgreSQL.

---

## What Was Built This Session

### Phase 1 — UI Polish ✅
- **TipTap rich text editor** — bold, italic, headings, bullet/ordered/task lists, blockquote, code blocks, highlight, character/word count
- **Folders UI** — create folder (name + color picker), delete folder, hover-reveal delete button
- **Starred view** — filter sidebar item showing only starred notes
- **Trash page** — soft-deleted notes, restore button, permanent delete

### Phase 2 — Engineering Features ✅
- **Conflict badge** — yellow ⚠ in editor status bar when field-level merge was applied
- **Sync Dashboard** — live stats (notes, pending ops, conflicts, devices), architecture diagram, device session table with online/offline indicator
- **Operation History / Time Travel** — per-note audit log, shows every op (create/update/delete), version transitions, conflict flags, device name, payload preview

### Phase 3 — Documentation ✅
- **README.md** — full architecture diagram (ASCII), sync flow diagram, conflict resolution diagram, API routes, WebSocket events, tech stack table, scalability discussion, project structure

---

## File Structure (complete)

```
SyncSphere/
├── client/src/
│   ├── components/
│   │   ├── layout/Sidebar.tsx         ← NEW: folders CRUD, trash/sync nav, starred
│   │   ├── notes/NoteEditor.tsx       ← NEW: TipTap, toolbar, conflict badge, history btn
│   │   ├── notes/NoteList.tsx
│   │   └── sync/SyncIndicator.tsx
│   ├── pages/
│   │   ├── AuthPage.tsx
│   │   ├── WorkspacePage.tsx          ← NEW: view routing (notes/trash/sync/history)
│   │   ├── TrashPage.tsx              ← NEW
│   │   ├── SyncDashboard.tsx          ← NEW
│   │   └── HistoryPage.tsx            ← NEW
│   ├── services/api.ts                ← NEW: deleteFolder, getSyncStatus, getOperationHistory
│   ├── sync/syncEngine.ts
│   ├── sync/offlineQueue.ts
│   ├── sync/conflictResolver.ts
│   ├── storage/db.ts
│   ├── websocket/socketClient.ts
│   ├── state/authStore.ts
│   ├── state/notesStore.ts
│   ├── types/index.ts
│   ├── index.css                      ← NEW: TipTap prose styles
│   └── App.tsx
├── server/src/
│   ├── controllers/auth.controller.ts
│   ├── controllers/notes.controller.ts
│   ├── controllers/sync.controller.ts
│   ├── services/auth.service.ts
│   ├── services/notes.service.ts
│   ├── services/sync.service.ts
│   ├── routes/index.ts
│   ├── websocket/gateway.ts
│   ├── middleware/auth.ts
│   ├── db/index.ts                    ← FIXED: uses connectionString + SSL
│   └── db/schema.sql                  ← FIXED: DROP TRIGGER IF EXISTS
├── README.md                          ← NEW: full docs with diagrams
├── PROJECT_CONTEXT.md
├── docker-compose.yml
└── package.json
```

---

## How to Run

```bash
cd SyncSphere

# Install TipTap (first time after session 2)
cd client && npm install && cd ..

# Run everything
npm run dev
```

Visit http://localhost:5173

---

## What To Do Next (future sessions)

1. **Presence avatars** — show colored avatar bubbles when multiple users view same note
2. **Tags UI** — tag input chip component, filter by tag in sidebar
3. **Share notes** — invite collaborator by email (backend already has note_collaborators table)
4. **Deploy** — Render (backend) + Vercel (frontend) + Neon (already done)
5. **Mobile responsive** — sidebar collapse, bottom nav on small screens

---

## Deploy Checklist (when ready)

### Backend → Render
1. Create Web Service on render.com
2. Set env vars: DATABASE_URL, JWT_SECRET, REFRESH_TOKEN_SECRET, CLIENT_URL
3. Build cmd: `cd server && npm install && npm run build`
4. Start cmd: `node server/dist/index.js`

### Frontend → Vercel
1. Import GitHub repo on vercel.com
2. Root: `client/`
3. Build: `npm run build`
4. Env: VITE_API_URL=https://your-render-url.onrender.com/api
5. VITE_WS_URL=https://your-render-url.onrender.com

---

## Environment Files

### server/.env
```
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://...@...neon.tech/neondb?sslmode=require
JWT_SECRET=...
JWT_EXPIRES_IN=7d
REFRESH_TOKEN_SECRET=...
REFRESH_TOKEN_EXPIRES_IN=30d
CLIENT_URL=http://localhost:5173
```

### client/.env
```
VITE_API_URL=http://localhost:3001/api
VITE_WS_URL=http://localhost:3001
```
