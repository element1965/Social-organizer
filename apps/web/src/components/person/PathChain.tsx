import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useNicknames } from '../../hooks/useNicknames';
import { Avatar } from '../ui2/Avatar';
import { formatMoney } from '../ui2/format';
import { IconChevron, IconPeople } from '../ui2/icons';

export type PathNode = {
  id: string;
  name: string;
  photoUrl: string | null;
  connectionCount: number;
  remainingBudget: number | null;
  /** Beyond the viewer's visible rings: the server sends only the place in the chain */
  hidden?: boolean;
};

/** One cell per visible person; people beyond the visible rings fold into one "…" cell. */
export function foldHidden<T extends { hidden?: boolean }>(nodes: T[]): Array<T | null> {
  const out: Array<T | null> = [];
  for (const node of nodes) {
    if (!node.hidden) out.push(node);
    else if (out[out.length - 1] !== null) out.push(null);
  }
  return out;
}

type PathChainProps = {
  nodes: PathNode[];
  /** Nickname the viewer uses for the last person. Falls back to the account name. */
  targetLabel?: string;
};

function firstWord(value: string): string {
  const trimmed = value.trim();
  const word = trimmed.split(/\s+/)[0];
  return word || trimmed;
}

/** Declared help, in $. Unset and 0 stay an em dash — never "0 $". */
function budgetText(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value) || value <= 0) return '—';
  return formatMoney(value);
}

function CoinIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
      <circle cx="8" cy="8" r="6.25" />
      <circle cx="8" cy="8" r="2.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

function JoinMark() {
  return (
    <span className="absolute left-0 top-0 flex h-9 w-5 -translate-x-1/2 items-center text-care" aria-hidden>
      <span className="h-0.5 flex-1 bg-care" />
      <IconChevron className="h-3 w-3 shrink-0" />
    </span>
  );
}

/** Handshake chain from findPath. Four links fit a 390 px screen without scrolling. */
export function PathChain({ nodes, targetLabel }: PathChainProps) {
  const { t } = useTranslation();
  const resolve = useNicknames();
  if (nodes.length < 2) return null;
  const cells = foldHidden(nodes);
  const compact = cells.length >= 4;
  const last = cells.length - 1;

  return (
    <ol aria-label={t('person.pathLabel')} className="mt-2 flex w-full min-w-0 list-none">
      {cells.map((node, index) => {
        if (!node) {
          // People the viewer cannot see: only that the chain passes through them
          return (
            <li key={`hidden-${index}`} className="relative flex min-w-[40px] flex-[0.5] basis-0">
              <JoinMark />
              <span className="flex h-9 flex-1 items-center justify-center text-body font-bold text-ink-muted" aria-hidden>
                …
              </span>
            </li>
          );
        }
        const self = index === 0;
        const target = index === last;
        const full = self
          ? t('common.you')
          : target
            ? (targetLabel?.trim() || node.name)
            : resolve(node.id, node.name);
        const label = compact && !self ? firstWord(full) : full;
        const body = (
          <>
            <Avatar
              name={full}
              src={node.photoUrl}
              size={36}
              className={target ? 'ring-2 ring-care' : undefined}
            />
            <span className="mt-1 w-full truncate text-center text-label font-bold text-ink">{label}</span>
            <span className="mt-0.5 flex w-full min-w-0 items-center justify-center gap-0.5 overflow-hidden whitespace-nowrap text-caption font-semibold text-ink-muted">
              <IconPeople className="h-3.5 w-3.5 shrink-0" />
              <span className="tabular-nums">{node.connectionCount}</span>
              <CoinIcon />
              <span className="truncate tabular-nums">{budgetText(node.remainingBudget)}</span>
            </span>
          </>
        );
        const cell = 'flex min-w-[72px] flex-1 basis-0 flex-col items-center';
        return (
          <li key={`${node.id}-${index}`} className="relative flex min-w-[72px] flex-1 basis-0">
            {self ? null : <JoinMark />}
            {self || target ? (
              <div className={cell}>{body}</div>
            ) : (
              <Link to={`/person/${node.id}`} className={`so-focus rounded-md ${cell}`}>
                {body}
              </Link>
            )}
          </li>
        );
      })}
    </ol>
  );
}
