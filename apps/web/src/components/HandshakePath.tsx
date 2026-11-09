import { Fragment } from 'react';
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
  resolveName?: (userId: string, name: string) => string;
}

export function HandshakePath({ path, onUserClick, compact = false, resolveName }: HandshakePathProps) {
  if (!path || path.length === 0) return null;

  if (compact) {
    return (
      <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-300">
        <span>{path.length - 1}</span>
        <span>🤝</span>
      </div>
    );
  }

  // People share the block width evenly, so a short path is centered and spread out; a long one
  // keeps a minimum width per person and scrolls sideways.
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <div className="flex items-start w-full">
        {path.map((user, idx) => {
          const isLast = idx === path.length - 1;
          const displayName = resolveName?.(user.id, user.name) ?? user.name;
          const words = displayName.trim().split(/\s+/);
          const firstWord = words[0] ?? '';
          const rest = words.slice(1).join(' ');

          return (
            <Fragment key={user.id}>
              <button
                onClick={() => onUserClick?.(user.id)}
                title={displayName}
                className="flex-1 basis-0 min-w-[4.5rem] flex flex-col items-center text-center px-1 py-1.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                <Avatar name={displayName} src={user.photoUrl} size="md" />
                {/* First word on line 1, the rest on line 2 — "Anna / Petrova" always reads the
                    same; two lines are reserved so the stats below stay aligned */}
                <span className="mt-1 w-full text-xs font-medium text-gray-900 dark:text-white leading-snug min-h-[2.75em]">
                  <span className="block truncate">{firstWord}</span>
                  {rest && <span className="block truncate">{rest}</span>}
                </span>
                {(user.connectionCount != null || user.remainingBudget != null) && (
                  <span className="mt-0.5 flex items-center justify-center gap-1.5 text-[11px] leading-tight whitespace-nowrap">
                    {user.connectionCount != null && (
                      <span className="text-gray-500 dark:text-gray-400">👥 {user.connectionCount}</span>
                    )}
                    {user.remainingBudget != null && (
                      <span className="font-medium text-green-600 dark:text-green-400">${Math.round(user.remainingBudget)}</span>
                    )}
                  </span>
                )}
              </button>
              {!isLast && (
                // Aligned with the avatar centers
                <ChevronRight aria-hidden className="w-4 h-4 mt-[1.125rem] text-gray-400 dark:text-gray-500 shrink-0 -mx-1" />
              )}
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}
