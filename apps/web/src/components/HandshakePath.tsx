import { ChevronRight, Users } from 'lucide-react';
import { Avatar } from './ui/avatar';

interface PathUser {
  id: string;
  name: string;
  photoUrl: string | null;
  connectionCount?: number;
}

interface HandshakePathProps {
  path: PathUser[];
  onUserClick?: (userId: string) => void;
  compact?: boolean;
}

export function HandshakePath({ path, onUserClick, compact = false }: HandshakePathProps) {
  if (!path || path.length === 0) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
        <span>{path.length - 1}</span>
        <span>🤝</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1 flex-wrap">
      {path.map((user, idx) => (
        <div key={user.id} className="flex items-center">
          <button
            onClick={() => onUserClick?.(user.id)}
            className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
          >
            <Avatar name={user.name} src={user.photoUrl} size="xs" />
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300 max-w-[80px] truncate">
              {user.name.split(' ')[0]}
            </span>
            {user.connectionCount !== undefined && (
              <span className="flex items-center gap-0.5 text-[10px] text-gray-400">
                <Users className="w-2.5 h-2.5" />
                {user.connectionCount}
              </span>
            )}
          </button>
          {idx < path.length - 1 && (
            <ChevronRight className="w-3 h-3 text-gray-400 mx-0.5 flex-shrink-0" />
          )}
        </div>
      ))}
    </div>
  );
}
