import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SitePage } from './SitePage';

export type LegalDoc = 'privacy' | 'terms' | 'delete';

const DOCS: { id: LegalDoc; to: string; key: string }[] = [
  { id: 'privacy', to: '/privacy', key: 'legal.privacy' },
  { id: 'terms', to: '/terms', key: 'legal.terms' },
  { id: 'delete', to: '/delete-account', key: 'legal.deleteAccount' },
];

export interface ProseSection {
  /** Anchor for the table of contents. */
  id: string;
  title: string;
  body: ReactNode;
}

/**
 * Legal template (site.html №5): heading 40, update date, a 720 px column of 16 / 1.6 text, the three legal
 * documents on the left with this page's sections under the current one. Where there is no room for the side
 * column the documents become a row of chips above the text.
 */
export function Prose({
  doc,
  title,
  meta,
  sections,
}: {
  doc: LegalDoc;
  title: string;
  meta?: string;
  sections: ProseSection[];
}) {
  const { t } = useTranslation();
  return (
    <SitePage title={`${title} — Social Organizer`} active="legal">
      <div className="site-legal">
        <nav className="site-toc" aria-label={t('legal.toc')}>
          {DOCS.map((d) => (
            <DocLink key={d.id} to={d.to} current={d.id === doc} label={t(d.key)}>
              {d.id === doc ? (
                <span className="sub" role="list" aria-label={t('legal.contents')}>
                  {sections.map((s) => (
                    <a key={s.id} href={`#${s.id}`} role="listitem">
                      {s.title}
                    </a>
                  ))}
                </span>
              ) : null}
            </DocLink>
          ))}
        </nav>
        <article className="site-prose">
          <h1>{title}</h1>
          {meta ? <p className="meta">{meta}</p> : null}
          {sections.map((s) => (
            <section key={s.id} aria-labelledby={s.id}>
              <h2 id={s.id}>{s.title}</h2>
              {s.body}
            </section>
          ))}
        </article>
      </div>
    </SitePage>
  );
}

function DocLink({ to, current, label, children }: { to: string; current: boolean; label: string; children?: ReactNode }) {
  return (
    <>
      <Link to={to} aria-current={current ? 'page' : undefined}>
        {label}
      </Link>
      {children}
    </>
  );
}
