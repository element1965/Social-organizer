import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Capacitor } from '@capacitor/core';
import { isTelegramWebApp } from '@so/tg-adapter';
import { QRCodeCanvas } from 'qrcode.react';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { getLastLoginMethod, useAuth, type LoginMethod } from '../hooks/useAuth';
import { Avatar, Button, Pill, formatMoney } from '../components/ui2';
import { NetFigure } from '../components/figures';
import { BrandLine, LanguageCorner, OnboardingFrame, StepText } from '../components/onboarding/OnboardingFrame';
import { SignInFlow } from '../components/onboarding/SignInFlow';
import {
  homePath,
  introPath,
  isFirstRunPending,
  readPendingInvite as readPending,
  setPendingInvite as setPending,
} from '../components/onboarding/flow';
import { useNetLabels } from '../components/onboarding/figureLabels';
import {
  CheckGlyph,
  ClockGlyph,
  Note,
  OfflineGlyph,
  ShareGlyph,
  Spinner,
  StateTile,
  TextButton,
} from '../components/onboarding/states';
import { buildWebInviteUrl } from '../lib/inviteUrl';
import { inviteSrcParam, safeAddressee, type InviteSrcParam } from '@so/shared';
import { clearInviteSrc, firstOpenOf, readInviteSrc, rememberInviteSrc } from '../lib/inviteSrc';
import { SITE_ORIGIN, storeLinks, useDevice } from '../lib/device';
import { QR_LOGO_LEVEL, qrLogo } from '../lib/qrLogo';
import { IconApple, IconPlay } from '../components/site/icons';

/** Thin-space thousands, as everywhere in the app ("1 240"). */
const num = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** Errors that mean the link itself is dead. */
type TrpcLikeError = { message?: string; data?: { code?: string } | null } | null | undefined;
/** Why a link is dead: each case has its own screen (SO-24 п.5). */
type DeadReason = 'deleted' | 'used' | 'notFound';
function deadReason(err: TrpcLikeError, usedByOther = false): DeadReason {
  if (usedByOther || err?.message === 'Invite already used') return 'used';
  if (err?.message === 'INVITER_DELETED') return 'deleted';
  return 'notFound';
}

export { safeAddressee };

/** The web app on a phone or computer (not the installed app or the Telegram Mini App): installing is offered. */
function offersInstall(): boolean {
  try {
    return !Capacitor.isNativePlatform() && !isTelegramWebApp();
  } catch {
    return false;
  }
}
function inTelegram(): boolean {
  try {
    return isTelegramWebApp();
  } catch {
    return false;
  }
}
/** Not found, inviter deleted, expired (all NOT_FOUND on the API) or already used by someone else. */
function isDeadError(err: TrpcLikeError): boolean {
  if (!err) return false;
  return err.data?.code === 'NOT_FOUND' || err.message === 'Invite already used';
}

/**
 * Invite (screens.md §12, onboarding.html №1, 9). A guest sees who calls them and signs in right here;
 * a signed-in person opening someone's link gets the same screen with "We know each other".
 * After sign-in through the invite the request is sent automatically and a new person goes on to the intro.
 */
export function InvitePage() {
  const { token = '' } = useParams<{ token: string }>();
  const [search] = useSearchParams();
  const addressee = safeAddressee(search.get('to'));
  // Which way the link travelled (funnel only): `?src=` of the shared address, or the bot's Mini App
  const srcParam = inviteSrcParam(search.get('src'));
  const src: InviteSrcParam | undefined = srcParam ?? readInviteSrc() ?? (inTelegram() ? 'tg' : undefined);
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const logout = useAuth((s) => s.logout);
  const isRealUser = isAuthenticated;
  // A newcomer decided by the sign-in path (flow.ts), read once before effects can clear anything
  const [firstRun, setFirstRun] = useState(isFirstRunPending);

  // Read before any effect: TelegramBootstrap drops the pending token as soon as a signed-in person lands here.
  // Signing in from this invite is the "yes", so it is accepted without asking again.
  const [cameThroughInvite, setCameThroughInvite] = useState(() => !!token && readPending() === token);

  // Signed in right on this page without a reload (native Google/Apple return to the same route, so the page
  // is not mounted again): that sign-in came through the invite too, and a new account goes on to the intro.
  const [guestHere, setGuestHere] = useState(!isAuthenticated);
  if (!isAuthenticated && !guestHere) setGuestHere(true);
  if (isAuthenticated && guestHere) {
    setGuestHere(false);
    if (token) setCameThroughInvite(true);
    if (isFirstRunPending()) setFirstRun(true);
  }

  const invite = trpc.invite.getByToken.useQuery({ token }, { enabled: !!token });
  const me = trpc.user.me.useQuery(undefined, { enabled: isRealUser, retry: 1 });
  const sessionDead = isRealUser && me.error?.data?.code === 'UNAUTHORIZED';

  // A stale session: drop it and show the guest screen
  useEffect(() => {
    if (sessionDead) logout();
  }, [sessionDead, logout]);

  // Keep the invite through every sign-in path (OAuth round-trips, Telegram, reloads)
  useEffect(() => {
    if (!isRealUser && token && invite.data) setPending(token);
  }, [isRealUser, token, invite.data]);

  // The source survives sign-in the same way; a guest opening a live invite is counted once per session
  const opened = trpc.invite.opened.useMutation();
  const countOpen = opened.mutate;
  const inviteLoaded = !!invite.data;
  useEffect(() => {
    if (isRealUser || !token || !inviteLoaded || !firstOpenOf(token)) return;
    // A fresh visit decides the source: one kept from an older link must not label this one
    if (srcParam) rememberInviteSrc(srcParam);
    else clearInviteSrc();
    countOpen({ src: srcParam ?? (inTelegram() ? 'tg' : undefined) });
  }, [isRealUser, token, inviteLoaded, srcParam, countOpen]);

  const usedByOther =
    !!invite.data?.usedById && !!me.data && invite.data.usedById !== me.data.id;
  const dead = !token || isDeadError(invite.error) || (isRealUser && usedByOther);
  // A network/server hiccup is not a dead link: offer a retry and keep the pending token
  const transient = !!invite.error && !dead;

  // A dead invite must not send the home redirect back here
  useEffect(() => {
    if (dead && readPending() === token) setPending(null);
  }, [dead, token]);

  if (dead) return <DeadLink signedIn={isRealUser && !sessionDead} reason={deadReason(invite.error, usedByOther)} />;
  if (transient) return <RetryScreen onRetry={() => void invite.refetch()} busy={invite.isFetching} />;
  if (invite.isLoading || (isRealUser && me.isLoading)) return <Loading />;
  if (!invite.data) return <DeadLink signedIn={isRealUser} reason="notFound" />;

  const inviter = invite.data.inviter;
  const networkCount = Number((invite.data as { networkCount?: number }).networkCount ?? 0);
  const total = Math.round(Number((invite.data as { totalIntentions?: number }).totalIntentions ?? 0));
  const hero = <InviteHero name={inviter.name} photoUrl={inviter.photoUrl} networkCount={networkCount} total={total} token={token} addressee={addressee} />;

  if (!isRealUser || sessionDead || !me.data) {
    return <SignInFlow top={<BrandLine />} centre redirect={`/invite/${token}`} hero={hero} />;
  }

  return (
    <AcceptView
      token={token}
      inviterId={inviter.id}
      inviterName={inviter.name}
      inviterPhotoUrl={inviter.photoUrl}
      meId={me.data.id}
      firstRun={firstRun || !me.data.onboardingCompleted}
      cameThroughInvite={cameThroughInvite}
      src={src}
      hero={<InviteHero name={inviter.name} photoUrl={inviter.photoUrl} networkCount={networkCount} total={total} token={token} addressee={addressee} signedIn />}
    />
  );
}

function InviteHero({
  name,
  photoUrl,
  networkCount,
  total,
  token,
  addressee = null,
  signedIn = false,
}: {
  name: string;
  photoUrl?: string | null;
  networkCount: number;
  total: number;
  /** For the way back from "How it works" */
  token: string;
  /** The invited person's name from `?to=`, put before the sentence. */
  addressee?: string | null;
  /** Signed-in variant: no "sign in" in the sentence. */
  signedIn?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Avatar name={name} src={photoUrl} size={88} className="mt-10" />
      <h1 className="mt-4 text-h2 font-bold [text-wrap:balance]">{addressee ? `${addressee}, ` : ''}{t('invite.calls', { name })}</h1>
      <p className="mt-2.5 max-w-[30ch] text-body-s text-ink-muted">{t(signedIn ? 'invite.sayKnown' : 'invite.say', { name: firstName(name) })}</p>
      <div className="mt-4 flex flex-wrap justify-center gap-2">
        <Pill className="whitespace-nowrap">{t('invite.network', { count: networkCount, n: num(networkCount) })}</Pill>
        {/* An intention is at least 1 $, so a smaller total is not shown at all */}
        {total >= 1 ? (
          <Pill tone="care" className="whitespace-nowrap">
            {t('invite.canHelp', { amount: formatMoney(total) })}
          </Pill>
        ) : null}
      </div>
      {/* A guest through a link skips the landing: one tap to the explanation, and a way back to this invite */}
      <Link
        to={`/how?invite=${encodeURIComponent(token)}`}
        className="so-focus mt-4 inline-flex min-h-11 items-center gap-1 text-body-s font-bold text-care"
      >
        {t('invite.howItWorks')}
        <span aria-hidden>→</span>
      </Link>
    </>
  );
}

/** Signed in: "We know each other" (or the automatic accept right after signing in through this link). */
function AcceptView({
  token,
  inviterId,
  inviterName,
  inviterPhotoUrl,
  meId,
  firstRun,
  cameThroughInvite,
  src,
  hero,
}: {
  token: string;
  inviterId: string;
  inviterName: string;
  inviterPhotoUrl?: string | null;
  meId: string;
  /** A new account: auto-accept, then the intro (never the result screen). */
  firstRun: boolean;
  cameThroughInvite: boolean;
  /** Which way the link travelled, sent with the request (funnel only) */
  src?: InviteSrcParam;
  hero: React.ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useAuth((s) => s.logout);
  const autoTried = useRef(false);
  // A newcomer on the web: after the request is saved, offer the app before the intro (SO-24 п.3)
  const [installStep, setInstallStep] = useState(false);

  const accept = trpc.invite.accept.useMutation({
    onSuccess: (data) => {
      setPending(null);
      clearInviteSrc();
      if (!firstRun) return;
      const r = data as { alreadyConnected?: boolean; pending?: boolean } | undefined;
      if (r?.pending && !r.alreadyConnected && offersInstall()) setInstallStep(true);
      else navigate(introPath(), { replace: true });
    },
    onError: (err) => {
      if (err.data?.code === 'UNAUTHORIZED') {
        setPending(token);
        logout();
        return;
      }
      // Any other failure is final for this link: drop it so home does not reopen the invite
      setPending(null);
    },
  });

  const own = inviterId === meId;

  useEffect(() => {
    if (own || autoTried.current) return;
    if (cameThroughInvite || firstRun) {
      autoTried.current = true;
      accept.mutate({ token, viaLink: true, src });
    }
  }, [own, cameThroughInvite, firstRun, accept, token, src]);

  // While the request waits, poll so the screen turns into "You know each other" when the inviter confirms
  const result = accept.data as { alreadyConnected?: boolean; pending?: boolean } | undefined;
  const waiting = accept.isSuccess && !!result?.pending;
  const intro = trpc.pending.introStatus.useQuery(undefined, { enabled: waiting && !firstRun, refetchInterval: 5000 });
  const confirmedNow = waiting && intro.data?.state === 'connected' && intro.data.person?.id === inviterId;
  const connected = accept.isSuccess && (!!result?.alreadyConnected || confirmedNow || !result?.pending);

  if (own) {
    return (
      <OnboardingFrame
        top={<BrandLine />}
        corner={<LanguageCorner />}
        centre
        foot={
          <>
            <Button className="w-full" icon={<ShareGlyph />} onClick={() => navigate('/add')}>
              {t('invite.shareOwn')}
            </Button>
            <TextButton onClick={() => navigate('/', { replace: true })}>{t('invite.toCircle')}</TextButton>
          </>
        }
      >
        <Avatar name={inviterName} src={inviterPhotoUrl} size={88} className="mt-10" />
        <StepText centre title={t('invite.ownTitle')}>{t('invite.ownText')}</StepText>
        <div className="mt-4 flex justify-center">
          <Pill className="max-w-full truncate">{buildWebInviteUrl(token).replace(/^https?:\/\/(www\.)?/, '')}</Pill>
        </div>
      </OnboardingFrame>
    );
  }

  if (installStep) {
    return <InstallStep inviterName={inviterName} token={token} onLater={() => navigate(introPath(), { replace: true })} />;
  }

  if (isDeadError(accept.error)) {
    return <DeadLink signedIn reason={deadReason(accept.error)} />;
  }

  const errorText = accept.error
    ? accept.error.message === 'CONNECTION_LIMIT_SELF'
      ? t('add.limitSelf')
      : accept.error.message === 'CONNECTION_LIMIT_OTHER'
        ? t('add.limitOther')
        : accept.error.message === 'Request declined'
          ? t('person.requestDeclined')
          : accept.error.message === 'REQUEST_COOLDOWN'
            ? t('person.requestCooldownSoon')
            : t('invite.failed')
    : '';

  const name = firstName(inviterName);
  let foot: React.ReactNode;
  if (accept.isSuccess && !firstRun) {
    foot = (
      <>
        {connected ? (
          <Note tone="care" icon={<CheckGlyph />} role="status">
            <b>{t('invite.connected', { name: inviterName })}</b>
          </Note>
        ) : (
          // Waiting is warm; it turns care when the inviter confirms (polled every 5 s)
          <Note tone="warm" icon={<ClockGlyph />} role="status">
            <b>{t('invite.waiting')}</b> {t('invite.sentText', { name })}
          </Note>
        )}
        <Button className="mt-4 w-full" onClick={() => navigate('/', { replace: true })}>
          {t('invite.toCircle')}
        </Button>
      </>
    );
  } else {
    foot = (
      <>
        {errorText ? (
          <p role="alert" className="mb-3 text-center text-caption font-semibold text-sos">
            {errorText}
          </p>
        ) : null}
        <Button
          className="w-full"
          loading={accept.isPending || (accept.isSuccess && firstRun)}
          onClick={() => {
            accept.reset();
            accept.mutate({ token, viaLink: true, src });
          }}
        >
          {accept.error ? t('common.retry') : t('invite.known')}
        </Button>
        <button
          type="button"
          onClick={() => {
            setPending(null);
            navigate(homePath(), { replace: true });
          }}
          className="so-focus mt-2 block min-h-11 w-full text-center text-body-s font-bold text-ink-muted"
        >
          {t('invite.notNow')}
        </button>
      </>
    );
  }

  return (
    <OnboardingFrame top={<BrandLine />} corner={<LanguageCorner />} centre foot={foot}>
      {hero}
    </OnboardingFrame>
  );
}

const METHOD_NAME: Record<LoginMethod, string> = { google: 'Google', apple: 'Apple', telegram: 'Telegram', email: 'e-mail' };

/**
 * The request is saved: tell the newcomer it went out, then offer the app with the same sign-in (SO-24 п.3).
 * A phone gets its own store; a computer gets a QR for the phone. "Later" keeps going in the browser.
 * No countdown and no automatic redirect, so coming back from the store never loops.
 */
function InstallStep({ inviterName, token, onLater }: { inviterName: string; token: string; onLater: () => void }) {
  const { t } = useTranslation();
  const device = useDevice();
  const method = getLastLoginMethod();
  const links = storeLinks(token);
  const name = firstName(inviterName);
  const qrValue = `${SITE_ORIGIN}/get?invite=${encodeURIComponent(token)}`;
  const storeCls =
    'so-focus flex h-primary w-full items-center justify-center gap-2.5 rounded-lg bg-ink px-4 text-body-l font-bold text-canvas';

  const store =
    device === 'android' ? (
      <a href={links.play} target="_blank" rel="noopener noreferrer" className={storeCls}>
        <IconPlay />
        {t('landing.start.play')}
      </a>
    ) : device === 'ios' ? (
      <a href={links.appstore} target="_blank" rel="noopener noreferrer" className={storeCls}>
        <IconApple />
        {t('landing.start.appstore')}
      </a>
    ) : null;

  return (
    <OnboardingFrame
      top={<BrandLine />}
      corner={<LanguageCorner />}
      centre
      foot={
        <>
          {store}
          {store ? (
            <TextButton onClick={onLater}>{t('invite.install.later')}</TextButton>
          ) : (
            <Button className="w-full" onClick={onLater}>
              {t('invite.install.continueWeb')}
            </Button>
          )}
        </>
      }
    >
      <div className="mt-10 flex justify-center">
        <StateTile tone="care">
          <CheckGlyph />
        </StateTile>
      </div>
      <StepText centre title={t('invite.install.title')}>
        {t('invite.install.text', { name })}
      </StepText>
      <ol className="mx-auto mt-4 w-full max-w-[34ch] space-y-2 text-start text-body-s">
        {method ? (
          <li className="flex items-start gap-2">
            <span aria-hidden className="font-bold text-care">✓</span>
            <span>{t('invite.install.stepSignedIn', { method: METHOD_NAME[method] })}</span>
          </li>
        ) : null}
        <li className="flex items-start gap-2">
          <span aria-hidden className="font-bold text-care">✓</span>
          <span>{t('invite.install.stepSaved')}</span>
        </li>
        <li className="flex items-start gap-2">
          <span aria-hidden className="font-bold text-ink-muted">→</span>
          <span>
            {method ? t('invite.install.stepSame', { method: METHOD_NAME[method] }) : t('invite.install.stepSameAny')}
          </span>
        </li>
      </ol>
      {device === 'desktop' ? (
        <div className="mx-auto mt-5 flex w-full max-w-[34ch] items-center gap-3 text-start">
          <QRCodeCanvas
            value={qrValue}
            size={112}
            marginSize={2}
            level={QR_LOGO_LEVEL}
            imageSettings={qrLogo(112)}
            role="img"
            aria-label={t('landing.start.qrAria')}
            className="shrink-0"
          />
          <span className="text-body-s text-ink-muted">{t('invite.install.qrText')}</span>
        </div>
      ) : null}
    </OnboardingFrame>
  );
}

/** A dead link, with its own reason: the inviter deleted the account, someone else used it, or it does not exist. */
function DeadLink({ signedIn, reason }: { signedIn: boolean; reason: DeadReason }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const labels = useNetLabels();
  return (
    <OnboardingFrame
      top={<BrandLine />}
      foot={
        <>
          <Button className="w-full" onClick={() => navigate(signedIn ? homePath() : '/', { replace: true })}>
            {t('invite.openApp')}
          </Button>
          {signedIn ? null : (
            <Button variant="ghost" className="mt-2.5 w-full" onClick={() => navigate('/login')}>
              {t('invite.signIn')}
            </Button>
          )}
        </>
      }
    >
      <div className="mt-4 flex h-[240px] items-center justify-center">
        <NetFigure step={0} labels={labels} className="h-full w-auto" />
      </div>
      <StepText title={t(`invite.dead.${reason}Title`)}>{t(`invite.dead.${reason}Text`)}</StepText>
    </OnboardingFrame>
  );
}

/** getByToken failed for a transient reason: keep the invite and let the person try again. */
function RetryScreen({ onRetry, busy }: { onRetry: () => void; busy: boolean }) {
  const { t } = useTranslation();
  return (
    <OnboardingFrame
      top={<BrandLine />}
      foot={
        <Button className="w-full" loading={busy} onClick={onRetry}>
          {t('common.retry')}
        </Button>
      }
    >
      {/* An icon, not the circle picture, so it is not mistaken for a dead link */}
      <StateTile slot>
        <OfflineGlyph />
      </StateTile>
      <StepText title={t('invite.loadFailedTitle')}>{t('invite.loadFailedText')}</StepText>
    </OnboardingFrame>
  );
}

function Loading() {
  return (
    <main className="grid min-h-[100dvh] place-items-center bg-canvas">
      <Spinner label="…" />
    </main>
  );
}
