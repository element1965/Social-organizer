import type { ReactNode } from 'react';
import { cn } from '../../lib/utils';
import { BrandMark } from './BrandMark';
import { Button } from './Button';

export function Panel({
  title,
  subtitle,
  variant = 'form',
  children,
  className,
}: {
  title?: string;
  subtitle?: string;
  variant?: 'form' | 'pubcard';
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        'mx-auto w-full max-w-[460px] rounded-2xl bg-surface px-8 pb-7 pt-8 text-ink shadow-card',
        variant === 'pubcard' && 'text-center',
        className,
      )}
    >
      {title ? <h2 className="text-h2 font-extrabold">{title}</h2> : null}
      {subtitle ? <p className="mt-2 text-caption font-semibold text-ink-muted">{subtitle}</p> : null}
      {children ? <div className={cn((title || subtitle) && 'mt-5')}>{children}</div> : null}
    </section>
  );
}

export function SiteHeader({
  brand,
  links,
  language,
  themeLabel,
  onTheme,
  loginLabel,
  onLogin,
}: {
  brand: string;
  links: { label: string; href: string; active?: boolean }[];
  language: string;
  themeLabel: string;
  onTheme: () => void;
  loginLabel: string;
  onLogin?: () => void;
}) {
  return (
    <header className="flex h-[72px] items-center gap-6 px-6 text-ink">
      <span className="flex items-center gap-2.5 text-body font-extrabold tracking-tight">
        <BrandMark size={30} />
        {brand}
      </span>
      <nav className="hidden items-center gap-5 md:flex" aria-label={brand}>
        {links.map((link) => (
          <a key={link.href} href={link.href} className={cn('text-body-s font-bold', link.active ? 'text-ink' : 'text-ink-muted')}>
            {link.label}
          </a>
        ))}
      </nav>
      <div className="ml-auto flex items-center gap-2">
        <span className="grid h-10 min-w-10 place-items-center rounded-md border border-line bg-surface px-2 text-label font-bold">
          {language}
        </span>
        <button
          type="button"
          aria-label={themeLabel}
          data-theme-toggle
          onClick={onTheme}
          className="so-focus grid h-10 w-10 place-items-center rounded-md border border-line bg-surface"
        >
          <span className="text-label font-bold">{themeLabel.slice(0, 1)}</span>
        </button>
        <Button size="md" onClick={onLogin} className="h-11 px-4">
          {loginLabel}
        </Button>
      </div>
    </header>
  );
}

export function SiteFooter({
  brand,
  note,
  links,
}: {
  brand: string;
  note: string;
  links: { label: string; href: string }[];
}) {
  return (
    <footer className="flex flex-col gap-3 px-6 py-8 text-ink md:flex-row md:items-center">
      <span className="flex items-center gap-2 text-body font-extrabold">
        <BrandMark size={24} />
        {brand}
      </span>
      <span className="text-caption font-semibold text-ink-muted">{note}</span>
      <nav className="flex flex-wrap gap-4 md:ml-auto">
        {links.map((link) => (
          <a key={link.href} href={link.href} className="text-caption font-semibold text-ink-muted">
            {link.label}
          </a>
        ))}
      </nav>
    </footer>
  );
}

export function StoreButton({
  children,
  icon,
  tone = 'dark',
}: {
  children: ReactNode;
  icon?: ReactNode;
  tone?: 'dark' | 'light';
}) {
  return (
    <button
      type="button"
      className={cn(
        'inline-flex h-primary items-center justify-center gap-2 rounded-lg px-4 text-body font-bold',
        tone === 'dark' ? 'bg-ink text-canvas' : 'border border-line bg-surface text-ink',
      )}
    >
      {icon ? <span className="h-[22px] w-[22px]">{icon}</span> : null}
      {children}
    </button>
  );
}

export function Stat({ value, label, delta }: { value: string; label: string; delta?: string }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <b className="text-[34px] font-extrabold leading-none tracking-tight tabular-nums text-ink md:text-[28px]">{value}</b>
      <span className="text-body-s font-semibold text-ink-muted">{label}</span>
      {delta ? <span className="text-caption font-bold text-care md:basis-full">{delta}</span> : null}
    </div>
  );
}

export function Prose({ title, updated, children }: { title: string; updated?: string; children: ReactNode }) {
  return (
    <article className="mx-auto w-full max-w-[720px] text-ink">
      <h1 className="text-[40px] font-extrabold leading-none tracking-tight">{title}</h1>
      {updated ? <p className="mt-3 text-caption font-semibold text-ink-muted">{updated}</p> : null}
      <div className="mt-6 space-y-4 text-body font-body leading-[1.6]">{children}</div>
    </article>
  );
}
