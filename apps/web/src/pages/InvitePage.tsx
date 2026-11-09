import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { trpc } from '../lib/trpc';
import { useAuth } from '../hooks/useAuth';
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

/** Thin-space thousands, as everywhere in the app ("1 240"). */
const num = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const firstName = (name: string) => name.trim().split(/\s+/)[0] || name;

/** Errors that mean the link itself is dead (one screen for all of them). */
type TrpcLikeError = { message?: string; data?: { code?: string } | null } | null | undefined;
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
  const isAuthenticated = useAuth((s) => s.isAuthenticated);
  const logout = useAuth((s) => s.logout);
  const isRealUser = isAuthenticated;
  // A newcomer decided by the sign-in path (flow.ts), read once before effects can clear anything
  const [firstRun] = useState(isFirstRunPending);

  // Read before any effect: TelegramBootstrap drops the pending token as soon as a signed-in person lands here.
  // Signing in from this invite is the "yes", so it is accepted without asking again.
  const [cameThroughInvite] = useState(() => !!token && readPending() === token);

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

  const usedByOther =
    !!invite.data?.usedById && !!me.data && invite.data.usedById !== me.data.id;
  const dead = !token || isDeadError(invite.error) || (isRealUser && usedByOther);
  // A network/server hiccup is not a dead link: offer a retry and keep the pending token
  const transient = !!invite.error && !dead;

  // A dead invite must not send the home redirect back here
  useEffect(() => {
    if (dead && readPending() === token) setPending(null);
  }, [dead, token]);

  if (dead) return <DeadLink signedIn={isRealUser && !sessionDead} />;
  if (transient) return <RetryScreen onRetry={() => void invite.refetch()} busy={invite.isFetching} />;
  if (invite.isLoading || (isRealUser && me.isLoading)) return <Loading />;
  if (!invite.data) return <DeadLink signedIn={isRealUser} />;

  const inviter = invite.data.inviter;
  const networkCount = Number((invite.data as { networkCount?: number }).networkCount ?? 0);
  const total = Math.round(Number((invite.data as { totalIntentions?: number }).totalIntentions ?? 0));
  const hero = <InviteHero name={inviter.name} photoUrl={inviter.photoUrl} networkCount={networkCount} total={total} />;

  if (!isRealUser || sessionDead || !me.data) {
    return <SignInFlow top={<BrandLine />} centre redirect={`/invite/${token}`} hero={hero} />;
  }

  return (
    <AcceptView
      token={token}
      inviterId={inviter.id}
      inviterName={inviter.name}
      meId={me.data.id}
      firstRun={firstRun || !me.data.onboardingCompleted}
      cameThroughInvite={cameThroughInvite}
      hero={<InviteHero name={inviter.name} photoUrl={inviter.photoUrl} networkCount={networkCount} total={total} signedIn />}
    />
  );
}

function InviteHero({
  name,
  photoUrl,
  networkCount,
  total,
  signedIn = false,
}: {
  name: string;
  photoUrl?: string | null;
  networkCount: number;
  total: number;
  /** Signed-in variant: no "sign in" in the sentence. */
  signedIn?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Avatar name={name} src={photoUrl} size={88} className="mt-10" />
      <h1 className="mt-4 text-h2 font-bold [text-wrap:balance]">{t('invite.calls', { name })}</h1>
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
    </>
  );
}

/** Signed in: "We know each other" (or the automatic accept right after signing in through this link). */
function AcceptView({
  token,
  inviterId,
  inviterName,
  meId,
  firstRun,
  cameThroughInvite,
  hero,
}: {
  token: string;
  inviterId: string;
  inviterName: string;
  meId: string;
  /** A new account: auto-accept, then the intro (never the result screen). */
  firstRun: boolean;
  cameThroughInvite: boolean;
  hero: React.ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const logout = useAuth((s) => s.logout);
  const autoTried = useRef(false);

  const accept = trpc.invite.accept.useMutation({
    onSuccess: () => {
      setPending(null);
      if (firstRun) navigate(introPath(), { replace: true });
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
      accept.mutate({ token });
    }
  }, [own, cameThroughInvite, firstRun, accept, token]);

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
        <Avatar name={inviterName} size={88} className="mt-10" />
        <StepText centre title={t('invite.ownTitle')}>{t('invite.ownText')}</StepText>
        <div className="mt-4 flex justify-center">
          <Pill className="max-w-full truncate">{buildWebInviteUrl(token).replace(/^https?:\/\/(www\.)?/, '')}</Pill>
        </div>
      </OnboardingFrame>
    );
  }

  if (isDeadError(accept.error)) {
    return <DeadLink signedIn />;
  }

  const errorText = accept.error
    ? accept.error.message === 'CONNECTION_LIMIT_SELF'
      ? t('add.limitSelf')
      : accept.error.message === 'CONNECTION_LIMIT_OTHER'
        ? t('add.limitOther')
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
            accept.mutate({ token });
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

/** One screen for every dead link: used, the inviter deleted the account, expired or not found. */
function DeadLink({ signedIn }: { signedIn: boolean }) {
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
      <StepText title={t('invite.deadTitle')}>{t('invite.deadText')}</StepText>
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
