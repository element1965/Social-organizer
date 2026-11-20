import { TELEGRAM_BOT_URL } from '../../lib/deployment';

/** Andrei Lubalin's report "From Human Behaviour to Social Coordination" (Zenodo). */
export const REPORT_URL = 'https://zenodo.org/records/21629935';
/** "Write to the team": the bot with the `team` start parameter. */
export const TEAM_URL = `${TELEGRAM_BOT_URL}?start=team`;

/**
 * The people behind the project, in the order the site shows them (landing "Who makes this", /press).
 * Words live in `team.<id>.name` and `team.<id>.role`; there are no photos, the avatar is the name's first letter.
 */
export const TEAM = ['lubalin', 'tvardovskyi'] as const;
/** First letter of a name, as the app's avatars show it. */
export function initial(name: string): string {
  return (Array.from(name.trim())[0] ?? '?').toUpperCase();
}
