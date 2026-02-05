import { Users, Wallet } from 'lucide-react';
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
    <div className="space-y-0">
      {path.map((user, idx) => {
        const isEven = idx % 2 === 0;
        const isLast = idx === path.length - 1;

        return (
          <div key={user.id}>
            {/* User row */}
            <div className={`flex ${isEven ? 'justify-start' : 'justify-end'}`}>
              <button
                onClick={() => onUserClick?.(user.id)}
                className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                style={{ width: '70%' }}
              >
                <Avatar name={user.name} src={user.photoUrl} size="md" />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-medium text-gray-900 dark:text-white text-left truncate">
                    {user.name}
                  </span>
                  <div className="flex items-center gap-2">
                    {user.connectionCount !== undefined && (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <Users className="w-3 h-3" />
                        {user.connectionCount}
                      </span>
                    )}
                    <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                      <Wallet className="w-3 h-3" />
                      ${Math.round(user.remainingBudget ?? 0)}
                    </span>
                  </div>
                </div>
              </button>
            </div>

            {/* Straight diagonal arrow between avatars */}
            {!isLast && (
              <svg width="100%" height="16" className="block">
                <line
                  x1={isEven ? '7%' : '37%'}
                  y1="0"
                  x2={isEven ? '37%' : '7%'}
                  y2="16"
                  stroke="#22c55e"
                  strokeWidth="2"
                />
              </svg>
            )}
          </div>
        );
      })}
    </div>
  );
}
