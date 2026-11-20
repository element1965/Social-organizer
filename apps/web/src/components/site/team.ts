import { TELEGRAM_BOT_URL } from '../../lib/deployment';

/** Andrei Lubalin's report "From Human Behaviour to Social Coordination" (Zenodo). */
export const REPORT_URL = 'https://zenodo.org/records/21629935';
/** "Write to the team": the bot with the `team` start parameter. */
export const TEAM_URL = `${TELEGRAM_BOT_URL}?start=team`;

/**
 * The people behind the project, in the order /press shows them (the landing names no one).
 * Words live in `team.<id>.name` and `team.<id>.role`; there are no photos, the avatar is the name's first letter.
 */
export const TEAM = ['lubalin', 'tvardovskyi', 'solovey'] as const;
export type TeamId = (typeof TEAM)[number];
/** A person's company, linked under the role on /press. A brand name, so it is not translated. */
export const TEAM_ORGS: Partial<Record<TeamId, { name: string; url: string }>> = {
  solovey: { name: 'Lambertain', url: 'https://www.lambertain.site/' },
};
/** First letter of a name, as the app's avatars show it. */
export function initial(name: string): string {
  return (Array.from(name.trim())[0] ?? '?').toUpperCase();
}
