import { useMemo } from 'react';

/* ---------- Визуализация пути рукопожатий (текстовая + иконки) ---------- */

export interface HandshakeUser {
  id: string;
  name: string;
  photoUrl: string | null;
}

export interface HandshakePathProps {
  path: HandshakeUser[];
  onUserClick?: (userId: string) => void;
  className?: string;
}

/**
 * Отображает цепочку рукопожатий: Ты → A → B → Создатель.
 * Используется в уведомлениях для показа связи.
 */
export function HandshakePath({ path, onUserClick, className }: HandshakePathProps) {
  const items = useMemo(() => path, [path]);

  if (items.length === 0) return null;

  return (
    <div className={className} style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
      {items.map((user, i) => (
        <span key={user.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
          {i > 0 && (
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ opacity: 0.4 }}>
              <path d="M6 3l5 5-5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          <button
            type="button"
            onClick={() => onUserClick?.(user.id)}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '2px 8px',
              borderRadius: 12,
              border: 'none',
              background: i === 0 ? 'rgba(59,130,246,0.15)' : i === items.length - 1 ? 'rgba(245,158,11,0.15)' : 'rgba(100,116,139,0.1)',
              cursor: onUserClick ? 'pointer' : 'default',
              fontSize: 13,
              fontWeight: 500,
              color: 'inherit',
            }}
          >
            {user.photoUrl ? (
              <img
                src={user.photoUrl}
                alt=""
                style={{ width: 18, height: 18, borderRadius: '50%', objectFit: 'cover' }}
              />
            ) : (
              <span
                style={{
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  background: '#64748b',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: 10,
                  color: '#fff',
                  fontWeight: 700,
                }}
              >
                {user.name[0]}
              </span>
            )}
            <span>{user.name}</span>
          </button>
        </span>
      ))}
    </div>
  );
}
