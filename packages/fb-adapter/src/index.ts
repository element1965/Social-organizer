// @so/fb-adapter — Facebook Instant Game SDK (stub)
export interface FBPlayer {
  id: string;
  name: string;
  photo: string;
}

export function initFBInstant(): Promise<void> {
  // TODO: FBInstant.initializeAsync()
  return Promise.resolve();
}

export function getFBPlayer(): Promise<FBPlayer | null> {
  // TODO: FBInstant.player
  return Promise.resolve(null);
}

export function getFBToken(): Promise<string | null> {
  // TODO: FBInstant.player.getSignedPlayerInfoAsync()
  return Promise.resolve(null);
}
