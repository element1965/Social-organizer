import { PUBLIC_PAGE_METADATA, WEB_ROUTES, type PublicPagePath } from '@so/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SitePage } from './SitePage';

export type LegalDoc = 'privacy' | 'terms' | 'delete';

const DOCS: { id: LegalDoc; to: PublicPagePath; key: string }[] = [
  { id: 'privacy', to: WEB_ROUTES.PRIVACY, key: 'legal.privacy' },
  { id: 'terms', to: WEB_ROUTES.TERMS, key: 'legal.terms' },
  { id: 'delete', to: WEB_ROUTES.DELETE_ACCOUNT, key: 'legal.deleteAccount' },
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
  intro,
  sections,
}: {
  doc: LegalDoc;
  title: string;
  meta?: string;
  /** Content between the heading and the first section (e.g. the deletion steps). */
  intro?: ReactNode;
  sections: ProseSection[];
}) {
  const { t } = useTranslation();
  const page = DOCS.find((item) => item.id === doc)!;
  return (
    <SitePage title={`${title} — ${t('common.appName')}`} description={t(PUBLIC_PAGE_METADATA[page.to].description)} active="legal">
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
          {intro}
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
