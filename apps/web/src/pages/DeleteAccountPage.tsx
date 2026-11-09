import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Prose, type ProseSection } from '../components/site/Prose';
import { Button } from '../components/ui2/Button';
import { useAuth } from '../hooks/useAuth';

const STEPS = ['legal.del.step1', 'legal.del.step2', 'legal.del.step3', 'legal.del.step4'] as const;
const GONE = ['legal.del.gone1', 'legal.del.gone2', 'legal.del.gone3', 'legal.del.gone4', 'legal.del.gone5'] as const;

/**
 * Public account-deletion page required by the stores (auth.html №25, №29): four numbered steps
 * (Profile → Account), a button that signs in and opens Account, what is deleted, what remains,
 * and what happens without access: no deletion by request, automatic deletion after 2 years
 * without sign-ins, with notices 30 and 7 days ahead.
 */
export function DeleteAccountPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const signedIn = useAuth((s) => s.isAuthenticated);

  const sections: ProseSection[] = [
    {
      id: 'deleted-data',
      title: t('legal.del.goneTitle'),
      body: (
        <ul>
          {GONE.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ul>
      ),
    },
    {
      id: 'retention',
      title: t('legal.del.whenTitle'),
      body: <p>{t('legal.del.whenText')}</p>,
    },
    {
      id: 'no-access',
      title: t('legal.del.noAccessTitle'),
      body: <p>{t('legal.del.noAccessText')}</p>,
    },
  ];

  return (
    <Prose
      doc="delete"
      title={t('legal.deleteAccount')}
      meta={t('legal.del.meta')}
      sections={sections}
      intro={
        <>
          <p>{t('legal.del.lead')}</p>
          <div role="list" className="mt-4 overflow-hidden rounded-xl bg-surface shadow-card">
            {STEPS.map((key, i) => (
              <div
                key={key}
                role="listitem"
                className="flex min-h-14 items-center gap-3 px-4 py-2 text-body leading-snug text-ink [&+div]:shadow-[inset_0_1px_0_rgb(var(--so-line)/0.08)]"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px] bg-ink text-label font-extrabold text-canvas" aria-hidden>
                  {i + 1}
                </span>
                <span>{t(key)}</span>
              </div>
            ))}
          </div>
          <Button className="mt-4 w-full" onClick={() => navigate(signedIn ? '/me/account' : '/login?redirect=%2Fme%2Faccount')}>
            {t('legal.del.cta')}
          </Button>
        </>
      }
    />
  );
}
