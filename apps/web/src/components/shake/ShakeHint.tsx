import { useTranslation } from 'react-i18next';
import { cn } from '../../lib/utils';
import { EnableShakeButton } from './EnableShakeButton';

/** Phone with motion marks on both sides. */
function IconShake({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden className={className}>
      <rect x="8" y="3.5" width="8" height="17" rx="2" />
      <path d="M11 17.5h2" />
      <path d="M4.5 9c-.8 1.9-.8 4.1 0 6M19.5 9c.8 1.9.8 4.1 0 6" />
    </svg>
  );
}

/** Only touch devices have the motion sensor the shake needs. */
function hasMotionSensor(): boolean {
  if (typeof window === 'undefined' || !('DeviceMotionEvent' in window)) return false;
  return window.matchMedia?.('(pointer: coarse)').matches ?? false;
}

/** Add screen: tells that two phones can simply be shaken together to connect. */
export function ShakeHint({ className }: { className?: string }) {
  const { t } = useTranslation();
  if (!hasMotionSensor()) return null;
  return (
    <section className={cn('rounded-xl bg-surface p-4 text-ink shadow-card', className)}>
      <div className="flex items-start gap-3">
        <IconShake className="mt-0.5 h-7 w-7 shrink-0" />
        <div>
          <h2 className="text-title font-bold">{t('shake.hintTitle')}</h2>
          <p className="mt-1.5 text-caption font-semibold text-ink-muted">{t('shake.hintBody')}</p>
        </div>
      </div>
      <EnableShakeButton className="mt-3 w-full" />
    </section>
  );
}
