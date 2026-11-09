/*
 * Telegram Mini App sign-in failed (auth.html №15): the reason in plain words, a retry with the same initData
 * and e-mail as text. No Google/Apple: they do not work inside the Mini App. Telegram draws the header.
 */
import { useTranslation } from 'react-i18next';
import { Button } from '../ui2';
import { OnboardingFrame, StepText } from './OnboardingFrame';
import { TelegramMark } from './brand';
import { StateTile, TextButton } from './states';

export function TelegramFailed({ onRetry, onEmail }: { onRetry: () => void; onEmail: () => void }) {
  const { t } = useTranslation();
  return (
    <OnboardingFrame
      foot={
        <>
          <Button className="w-full" onClick={onRetry}>
            {t('login.tgRetry')}
          </Button>
          <TextButton tone="care" onClick={onEmail}>
            {t('login.email')}
          </TextButton>
        </>
      }
    >
      <StateTile tone="sos" slot>
        <TelegramMark />
      </StateTile>
      <StepText title={t('login.tgFailedTitle')}>{t('login.tgFailedText')}</StepText>
    </OnboardingFrame>
  );
}
