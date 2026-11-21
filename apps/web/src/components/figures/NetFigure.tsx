import { useLayoutEffect, useRef, useState } from 'react';
import { usePrefersReducedMotion } from '../../lib/scrollPlay';
import { C, FigText, Glyph, polar, r1 } from './shared';

export type NetStep = 0 | 1 | 2;

export interface NetFigureLabels {
  /** The six people you know, clockwise from the top. */
  names: string[];
  you: string;
  /** Who asks (a friend of a friend). */
  asker: string;
  /** Amount tag on the request path. */
  amount: string;
  chatTitle: string;
  chatMembers: readonly [string, string, string];
  rtl: boolean;
  aria: string;
}

export const NET_LABELS_RU: NetFigureLabels = {
  names: ['Кира', 'Олег', 'Ира', 'Дима', 'Лена', 'Макс'],
  you: 'Вы',
  asker: 'Мария',
  amount: '300 $',
  chatTitle: 'Чат участников',
  chatMembers: ['Мария', 'Олег', 'Лена'],
  rtl: false,
  aria: 'Схема круга',
};

export interface NetFigureProps {
  /** 0 rings, 1 request path, 2 chat. */
  step: NetStep;
  /** Texts; i18n wiring passes translated strings here. Defaults are Russian. */
  labels?: Partial<NetFigureLabels>;
  className?: string;
}

const CX = 160;
const CY = 150;
const R1 = 74;
const R2 = 126;

const CHAT = { x: 35, width: 250, anchorY: 238, bottom: 290, textOffset: 82 };
const CHAT_MEMBERS_WIDTH = CHAT.width - CHAT.textOffset - 24;

type ChatCardLabels = Pick<NetFigureLabels, 'chatTitle' | 'chatMembers' | 'rtl'>;

function ChatCard({ chatTitle, chatMembers: [first, second, third], rtl }: ChatCardLabels) {
  const all = `${first} · ${second} · ${third}`;
  const firstPair = `${first} · ${second}`;
  const lastPair = `${second} · ${third}`;
  const measurements = useRef<SVGGElement>(null);
  const [wrap, setWrap] = useState<'none' | 'after-pair' | 'before-pair' | 'each'>('none');

  useLayoutEffect(() => {
    const labels = Array.from(measurements.current!.querySelectorAll('text'));
    const fits = (index: number) => labels[index]!.getComputedTextLength() <= CHAT_MEMBERS_WIDTH;
    const measure = () => {
      setWrap(fits(0) ? 'none' : fits(1) ? 'after-pair' : fits(2) ? 'before-pair' : 'each');
    };
    measure();
    document.fonts.addEventListener('loadingdone', measure);
    return () => document.fonts.removeEventListener('loadingdone', measure);
  }, [all, firstPair, lastPair, rtl]);

  const rows = {
    none: [all],
    'after-pair': [firstPair, third],
    'before-pair': [first, lastPair],
    each: [first, second, third],
  }[wrap];
  const height = 54 + (rows.length - 1) * 13;
  const y = CHAT.bottom - height;
  const centerY = y + height / 2;
  const fromStart = (offset: number) => CHAT.x + (rtl ? CHAT.width - offset : offset);
  const memberRow = (content: string, baseline: number) => (
    <FigText key={baseline} x={fromStart(CHAT.textOffset)} y={baseline} size={11} weight={700} color={C.muted} anchor="start">
      {content}
    </FigText>
  );

  return (
    <g className="net-chat" direction={rtl ? 'rtl' : 'ltr'}>
      <rect x={CHAT.x} y={y} width={CHAT.width} height={height} rx={27} fill={C.paper} stroke={C.line} />
      <g className="net-chat-avatars">
        {[
          [C.care, C.onCare],
          [C.ink, C.canvas],
          [C.muted, C.canvas],
        ].map(([bg, fg], i) => {
          const x = fromStart(26 + i * 18);
          return (
            <g key={i}>
              <circle cx={x} cy={centerY} r={12} fill={bg!} stroke={C.paper} strokeWidth={2} />
              <Glyph x={x} y={centerY} r={11} color={fg!} />
            </g>
          );
        })}
      </g>
      <g className="net-chat-labels">
        <FigText x={fromStart(CHAT.textOffset)} y={y + 22} size={13} weight={800} color={C.ink} anchor="start">
          {chatTitle}
        </FigText>
        {rows.map((row, i) => memberRow(row, y + 38 + i * 13))}
      </g>
      <g ref={measurements} visibility="hidden" aria-hidden="true">
        {[all, firstPair, lastPair].map((row, i) => memberRow(row, i))}
      </g>
    </g>
  );
}

/** The network around you in three frames. viewBox 320x300. */
export function NetFigure({ step, labels, className }: NetFigureProps) {
  const reduce = usePrefersReducedMotion();
  const L = { ...NET_LABELS_RU, ...labels };
  const names = L.names.length >= 6 ? L.names : NET_LABELS_RU.names;

  const ring1 = names.slice(0, 6).map((n, i) => ({ n, i, ...polar(CX, CY, -90 + i * 60, R1) }));
  const kids = ring1.flatMap((_p, i) =>
    [-18, 18].map((d, k) => ({ p: i, k, ...polar(CX, CY, -90 + i * 60 + d, R2) })),
  );
  const asker = kids.find((k) => k.p === 1 && k.k === 1)!; // top right, a child of the second person
  const ask = ring1[1]!;
  const helper = ring1[4]!;

  const hot1 = step === 1 ? [1] : step === 2 ? [1, 4] : [];
  const dim = step > 0;

  const label = (x: number, y: number, r: number, name: string, color: string) => (
    <FigText x={r1(x)} y={r1(y + r + 13)} size={11} weight={700} color={color}>
      {name}
    </FigText>
  );
  const ava = (x: number, y: number, r: number, name: string) => (
    <g key={name}>
      <circle cx={r1(x)} cy={r1(y)} r={r} fill={C.paper} stroke={C.lineStrong} strokeWidth={1.5} />
      <Glyph x={r1(x)} y={r1(y)} r={r} color={C.ink} />
      {label(x, y, r, name, C.muted)}
    </g>
  );
  const avaHot = (x: number, y: number, r: number, name: string) => (
    <g key={`hot-${name}`}>
      <circle cx={r1(x)} cy={r1(y)} r={r} fill={C.careSoft} stroke={C.care} strokeWidth={2} />
      <Glyph x={r1(x)} y={r1(y)} r={r} color={C.care} />
      {label(x, y, r, name, C.care)}
    </g>
  );

  const you = (
    <g>
      {step === 0 && <circle cx={CX} cy={CY} r={32} fill="none" stroke={C.care} strokeWidth={1.5} opacity={0.45} />}
      <circle cx={CX} cy={CY} r={22} fill={C.care} />
      <FigText x={CX} y={CY + 5} size={13} weight={800} color={C.onCare}>
        {L.you}
      </FigText>
    </g>
  );

  const requestPath = `M${r1(asker.x)} ${r1(asker.y)} L${r1(ask.x)} ${r1(ask.y)} L${CX} ${CY}`;

  return (
    <svg viewBox="0 0 320 300" role="img" aria-label={L.aria} className={className}>
      <g opacity={dim ? 0.38 : 1} style={reduce ? undefined : { transition: 'opacity var(--dur-base, .26s)' }}>
        <circle cx={CX} cy={CY} r={R1} fill="none" stroke={C.line} strokeDasharray="2 6" strokeLinecap="round" />
        <circle cx={CX} cy={CY} r={R2} fill="none" stroke={C.line} strokeDasharray="2 6" strokeLinecap="round" opacity={0.8} />
        {ring1.map((p) => (
          <line key={p.i} x1={CX} y1={CY} x2={r1(p.x)} y2={r1(p.y)} stroke={C.lineStrong} strokeWidth={1.5} />
        ))}
        {kids.map((k) => (
          <line key={`l${k.p}-${k.k}`} x1={r1(ring1[k.p]!.x)} y1={r1(ring1[k.p]!.y)} x2={r1(k.x)} y2={r1(k.y)} stroke={C.line} strokeWidth={1.2} />
        ))}
        {kids.map((k) =>
          k === asker && step > 0 ? null : (
            <circle key={`k${k.p}-${k.k}`} cx={r1(k.x)} cy={r1(k.y)} r={7} fill={C.surface2} stroke={C.lineStrong} strokeWidth={1.2} />
          ),
        )}
        {ring1.map((p) => (hot1.includes(p.i) ? null : ava(p.x, p.y, 17, p.n)))}
      </g>

      {step === 1 && (
        <>
          <path d={requestPath} fill="none" stroke={C.care} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
          {avaHot(ask.x, ask.y, 17, ask.n)}
          {avaHot(asker.x, asker.y, 15, L.asker)}
          <g>
            <rect x={r1(asker.x - 40)} y={r1(asker.y - 40)} width={50} height={22} rx={11} fill={C.care} />
            <FigText x={r1(asker.x - 15)} y={r1(asker.y - 25)} size={11} weight={800} color={C.onCare}>
              {L.amount}
            </FigText>
          </g>
          {!reduce && (
            <circle r={5} fill={C.care}>
              <animateMotion dur="2.2s" repeatCount="indefinite" path={requestPath} />
            </circle>
          )}
          {you}
        </>
      )}

      {step === 2 && (
        <>
          {[helper, ask, asker].map((p, i) => (
            <line key={i} x1={r1(p.x)} y1={r1(p.y)} x2={CX} y2={CHAT.anchorY} stroke={C.care} strokeWidth={2} strokeLinecap="round" opacity={0.7} />
          ))}
          {avaHot(helper.x, helper.y, 17, helper.n)}
          {avaHot(ask.x, ask.y, 17, ask.n)}
          {avaHot(asker.x, asker.y, 15, L.asker)}
          {you}
          <ChatCard {...L} />
        </>
      )}

      {step === 0 && you}
    </svg>
  );
}
