import React, { useEffect, useState } from 'react';
import { socketClient } from '../../websocket/socketClient';
import type { PresenceUser } from '../../types';

interface Props {
  noteId: string | null;
}

export const PresenceAvatars: React.FC<Props> = ({ noteId }) => {
  const [users, setUsers] = useState<PresenceUser[]>([]);

  useEffect(() => {
    if (!noteId) {
      setUsers([]);
      return;
    }

    const unsub = socketClient.onPresenceUpdate((data) => {
      if (data.noteId === noteId) setUsers(data.users);
    });

    return () => {
      unsub();
    };
  }, [noteId]);

  if (users.length <= 1) return null; // Only show when others are present

  return (
    <div className="flex items-center gap-1.5" title="People viewing this note">
      <span className="text-xs text-gray-600 mr-1">Viewing:</span>
      <div className="flex -space-x-1.5">
        {users.slice(0, 5).map((u) => (
          <div
            key={u.socketId}
            className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white border-2 border-gray-900 shrink-0"
            style={{ backgroundColor: u.color }}
            title={u.userName || u.userId}
          >
            {(u.userName || u.userId).slice(0, 1).toUpperCase()}
          </div>
        ))}
        {users.length > 5 && (
          <div className="w-6 h-6 rounded-full bg-gray-700 border-2 border-gray-900 flex items-center justify-center text-xs text-gray-300">
            +{users.length - 5}
          </div>
        )}
      </div>
    </div>
  );
};
