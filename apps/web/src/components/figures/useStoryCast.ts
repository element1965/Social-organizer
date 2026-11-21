import { useTranslation } from 'react-i18next';

type Role = 'asker' | 'mediator' | 'supporter' | 'newcomer' | 'friend1' | 'friend2' | 'friend3' | 'friend4';

/** The same people appear in the landing story, the walkthrough and the onboarding figures. */
export function useStoryCast() {
  const { t } = useTranslation();
  const { asker, mediator, supporter, newcomer, friend1, friend2, friend3, friend4 } = t(
    'landing.v2.story.cast', { returnObjects: true },
  ) as Record<Role, string>;
  // Keep the mediator and supporter in the ring positions highlighted by NetFigure.
  const names = [friend1, mediator, friend2, friend3, supporter, friend4];
  const chatMembers = [asker, mediator, supporter] as const;
  return { asker, mediator, supporter, newcomer, names, chatMembers };
}
