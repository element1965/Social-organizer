import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';

/**
 * Shown on old links to screens outside the money MVP (skills, needs, matches).
 * The old screen is not rendered; the user gets a clear way back home.
 */
export function RetiredFeaturePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <div className="p-4">
      <Card>
        <CardContent className="py-6 text-center space-y-3">
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">{t('retired.title')}</h1>
          <p className="text-sm text-gray-600 dark:text-gray-300">{t('retired.text')}</p>
          <Button className="w-full" onClick={() => navigate('/dashboard', { replace: true })}>
            {t('retired.back')}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
