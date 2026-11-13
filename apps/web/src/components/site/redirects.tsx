import { useEffect } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { detectDevice, getTarget } from '../../lib/device';
import { safeInviteToken } from '../onboarding/flow';

/**
 * `/i/<slug>` — the short personal link shown on the invite card (orginizer.com/i/anna).
 * It opens the same invite page as `/?invite=anna`; anything that is not a valid slug goes home.
 */
export function SlugRedirect() {
  const { slug } = useParams();
  const { search } = useLocation();
  const token = safeInviteToken(slug);
  // The query rides along: `?to=` (the invited person's name, SO-24) and `?lang=` must reach the invite page
  return <Navigate to={token ? { pathname: `/invite/${token}`, search } : '/'} replace />;
}

/** Old landing URLs (`/welcome`, `/arvut`) open the home page; the query (`?invite=`, `?redirect=`) is kept. */
export function RedirectHome() {
  const { search, hash } = useLocation();
  return <Navigate to={{ pathname: '/', search, hash }} replace />;
}

/**
 * `/get` — the address in the desktop QR card. A phone camera opens it and is sent to its store
 * (Google Play or App Store, with the invite as referrer); anything else lands on the site.
 */
export function GetRedirect() {
  const { search } = useLocation();
  const invite = new URLSearchParams(search).get('invite');
  const target = getTarget(detectDevice(), invite);
  const external = /^https?:/.test(target);

  useEffect(() => {
    if (external) window.location.replace(target);
  }, [external, target]);

  if (!external) return <Navigate to={target} replace />;
  return null;
}
