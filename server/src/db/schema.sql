-- SyncSphere Database Schema
-- Run this on your PostgreSQL instance

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Devices table (for device session tracking)
CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_name VARCHAR(255),
    device_type VARCHAR(50),
    last_seen TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Refresh tokens
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id) ON DELETE CASCADE,
    token TEXT UNIQUE NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Folders
CREATE TABLE IF NOT EXISTS folders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    color VARCHAR(20) DEFAULT '#6366f1',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted BOOLEAN DEFAULT FALSE
);

-- Notes table (core)
CREATE TABLE IF NOT EXISTS notes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    folder_id UUID REFERENCES folders(id) ON DELETE SET NULL,
    title TEXT NOT NULL DEFAULT 'Untitled',
    content TEXT DEFAULT '',
    content_delta JSONB DEFAULT '[]',  -- for rich text delta
    tags TEXT[] DEFAULT '{}',
    is_starred BOOLEAN DEFAULT FALSE,
    is_pinned BOOLEAN DEFAULT FALSE,
    version BIGINT DEFAULT 1,          -- sync version counter
    checksum TEXT,                     -- content hash for quick comparison
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted BOOLEAN DEFAULT FALSE,
    deleted_at TIMESTAMPTZ
);

-- Operations log (the sync backbone)
CREATE TABLE IF NOT EXISTS operations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID REFERENCES devices(id),
    operation_type VARCHAR(50) NOT NULL,  -- 'create','update_title','update_content','delete','restore','star','pin'
    payload JSONB NOT NULL DEFAULT '{}',
    base_version BIGINT,                  -- version this op was based on
    result_version BIGINT,                -- version after applying
    vector_clock JSONB DEFAULT '{}',      -- CRDT vector clock
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    applied_at TIMESTAMPTZ,
    conflict BOOLEAN DEFAULT FALSE,
    conflict_resolved_by UUID REFERENCES operations(id)
);

-- Sync state per device
CREATE TABLE IF NOT EXISTS sync_state (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    last_sync_at TIMESTAMPTZ DEFAULT NOW(),
    last_operation_id UUID,
    pending_ops_count INTEGER DEFAULT 0,
    UNIQUE(user_id, device_id)
);

-- Note collaborators (future: share notes)
CREATE TABLE IF NOT EXISTS note_collaborators (
    note_id UUID REFERENCES notes(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE CASCADE,
    permission VARCHAR(20) DEFAULT 'edit',  -- 'view', 'edit'
    added_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (note_id, user_id)
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notes_user_id ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_updated_at ON notes(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_notes_deleted ON notes(deleted);
CREATE INDEX IF NOT EXISTS idx_operations_note_id ON operations(note_id);
CREATE INDEX IF NOT EXISTS idx_operations_user_id ON operations(user_id);
CREATE INDEX IF NOT EXISTS idx_operations_timestamp ON operations(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_operations_device_id ON operations(device_id);
CREATE INDEX IF NOT EXISTS idx_sync_state_user_device ON sync_state(user_id, device_id);

-- Update trigger
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notes_updated_at ON notes;
CREATE TRIGGER notes_updated_at BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS folders_updated_at ON folders;
CREATE TRIGGER folders_updated_at BEFORE UPDATE ON folders
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
DROP TRIGGER IF EXISTS users_updated_at ON users;
CREATE TRIGGER users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
-- (appended fix — already handled above via CREATE OR REPLACE)
