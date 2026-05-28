import { Server as IOServer, Socket } from 'socket.io';
import { Server as HTTPServer } from 'http';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { touchDevice } from '../services/auth.service';

interface AuthSocket extends Socket {
  userId?: string;
  deviceId?: string;
  userName?: string;
}

interface PresenceUser {
  userId: string;
  deviceId?: string;
  userName?: string;
  socketId: string;
  currentNoteId?: string;
  cursor?: { line: number; ch: number };
  color: string;
}

// In-memory presence map: noteId -> [users]
const notePresence = new Map<string, Map<string, PresenceUser>>();

const COLORS = ['#f43f5e','#f97316','#eab308','#22c55e','#06b6d4','#6366f1','#a855f7','#ec4899'];
let colorIdx = 0;

export const createWebSocketGateway = (httpServer: HTTPServer) => {
  const io = new IOServer(httpServer, {
    cors: {
      origin: env.CLIENT_ORIGINS,
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
  });

  // Auth middleware
  io.use((socket: AuthSocket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
    if (!token) return next(new Error('Authentication required'));

    try {
      const payload = jwt.verify(token, env.JWT_SECRET) as {
        userId: string; deviceId?: string; email?: string;
      };
      socket.userId = payload.userId;
      socket.deviceId = payload.deviceId;
      socket.userName = payload.email?.split('@')[0] || 'User';
      next();
    } catch {
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: AuthSocket) => {
    console.log(`WS connected: ${socket.userId} (${socket.id})`);
    void touchDevice(socket.deviceId).catch((err) => {
      console.warn('Failed to update socket device last_seen:', err);
    });

    // --- Note room: join / leave ---
    socket.on('note:join', (noteId: string) => {
      socket.join(`note:${noteId}`);

      if (!notePresence.has(noteId)) notePresence.set(noteId, new Map());
      const color = COLORS[colorIdx++ % COLORS.length];

      notePresence.get(noteId)!.set(socket.id, {
        userId: socket.userId!,
        deviceId: socket.deviceId,
        userName: socket.userName,
        socketId: socket.id,
        currentNoteId: noteId,
        color,
      });

      // Broadcast presence to room
      io.to(`note:${noteId}`).emit('presence:update', {
        noteId,
        users: Array.from(notePresence.get(noteId)!.values()),
      });
    });

    socket.on('note:leave', (noteId: string) => {
      leaveNote(socket, noteId);
    });

    // --- Live editing ---
    socket.on('note:edit', (data: { noteId: string; delta: unknown; version: number }) => {
      // Broadcast to all other clients in the note room
      socket.to(`note:${data.noteId}`).emit('note:remote_edit', {
        ...data,
        userId: socket.userId,
        deviceId: socket.deviceId,
        timestamp: new Date().toISOString(),
      });
    });

    // --- Cursor sync ---
    socket.on('cursor:update', (data: { noteId: string; cursor: { line: number; ch: number } }) => {
      const presence = notePresence.get(data.noteId)?.get(socket.id);
      if (presence) {
        presence.cursor = data.cursor;
        socket.to(`note:${data.noteId}`).emit('cursor:remote', {
          userId: socket.userId,
          socketId: socket.id,
          cursor: data.cursor,
          color: presence.color,
        });
      }
    });

    // --- Typing indicator ---
    socket.on('typing:start', (noteId: string) => {
      socket.to(`note:${noteId}`).emit('typing:remote', {
        userId: socket.userId,
        userName: socket.userName,
        typing: true,
      });
    });

    socket.on('typing:stop', (noteId: string) => {
      socket.to(`note:${noteId}`).emit('typing:remote', {
        userId: socket.userId,
        userName: socket.userName,
        typing: false,
      });
    });

    // --- Sync notification ---
    // When server applies a sync, notify other devices
    socket.on('sync:complete', (data: { affectedNoteIds: string[] }) => {
      // Notify all user's other devices
      socket.to(`user:${socket.userId}`).emit('sync:invalidate', {
        noteIds: data.affectedNoteIds,
        fromDevice: socket.deviceId,
      });
    });

    // Join personal room for cross-device sync notifications
    socket.join(`user:${socket.userId}`);

    // --- Disconnect ---
    socket.on('disconnect', () => {
      // Clean up from all note rooms
      notePresence.forEach((users, noteId) => {
        if (users.has(socket.id)) {
          leaveNote(socket, noteId);
        }
      });
      console.log(`WS disconnected: ${socket.userId} (${socket.id})`);
    });
  });

  const leaveNote = (socket: AuthSocket, noteId: string) => {
    socket.leave(`note:${noteId}`);
    notePresence.get(noteId)?.delete(socket.id);
    if (notePresence.get(noteId)?.size === 0) {
      notePresence.delete(noteId);
    } else {
      io.to(`note:${noteId}`).emit('presence:update', {
        noteId,
        users: Array.from(notePresence.get(noteId)?.values() || []),
      });
    }
  };

  // Expose io for controllers to emit
  return io;
};
