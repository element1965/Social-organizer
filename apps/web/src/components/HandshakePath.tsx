import { ChevronRight } from 'lucide-react';
import { Avatar } from './ui/avatar';

interface PathUser {
  id: string;
  name: string;
  photoUrl: string | null;
  connectionCount?: number;
  remainingBudget?: number | null;
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
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="flex items-start gap-1 w-max">
        {path.map((user, idx) => {
          const isLast = idx === path.length - 1;
          const nameParts = user.name.split(' ');

          return (
            <div key={user.id} className="flex items-center">
              <button
                onClick={() => onUserClick?.(user.id)}
                className="flex flex-col items-center text-center p-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors w-16"
              >
                <Avatar name={user.name} src={user.photoUrl} size="sm" />
                {nameParts.map((part, i) => (
                  <span key={i} className="text-[11px] font-medium text-gray-900 dark:text-white leading-tight mt-0.5 truncate max-w-full">
                    {part}
                  </span>
                ))}
                {user.connectionCount != null && (
                  <span className="text-[10px] text-gray-400 leading-tight">
                    👥 {user.connectionCount}
                  </span>
                )}
                {user.remainingBudget != null && (
                  <span className="text-[10px] text-green-600 dark:text-green-400 leading-tight">
                    ${Math.round(user.remainingBudget)}
                  </span>
                )}
              </button>
              {!isLast && (
                <ChevronRight className="w-4 h-4 text-gray-300 dark:text-gray-600 shrink-0 -mx-0.5" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
