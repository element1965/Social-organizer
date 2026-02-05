import { Users } from 'lucide-react';
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
                className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                style={{ width: '70%' }}
              >
                <Avatar name={user.name} src={user.photoUrl} size="md" />
                <span className="flex-1 text-sm font-medium text-gray-900 dark:text-white text-left truncate">
                  {user.name}
                </span>
                {user.connectionCount !== undefined && (
                  <span className="flex items-center gap-1 text-xs text-gray-400">
                    <Users className="w-3 h-3" />
                    {user.connectionCount}
                  </span>
                )}
              </button>
            </div>

            {/* Arrow connector */}
            {!isLast && (
              <div className={`flex ${isEven ? 'justify-start' : 'justify-end'} px-6`}>
                <svg
                  width="120"
                  height="28"
                  viewBox="0 0 120 28"
                  className={isEven ? '' : 'scale-x-[-1]'}
                >
                  {/* Elbow line going down then right */}
                  <path
                    d="M 20 0 L 20 14 L 100 14 L 100 28"
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  {/* Arrowhead */}
                  <path
                    d="M 94 22 L 100 28 L 106 22"
                    fill="none"
                    stroke="#22c55e"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
