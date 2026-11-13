/**
 * The only seam between the game and the outside world (portal SDKs, app
 * stores, device storage). One implementation per target; game code talks to
 * this interface and nothing else. See ARCHITECTURE.md.
 */
export interface Platform {
  /** Short name for analytics (`session_start.platform`). */
  readonly name: string;
  /** Whether this build offers rewarded ads at all (the friends playtest does not). */
  readonly rewardedAds: boolean;
  init(): Promise<void>;
  /** Player is actively solving: portals use this for ad pacing and analytics. */
  gameplayStart(): void;
  gameplayStop(): void;
  /** Interstitial. Resolves after the ad finishes, or right away on no-fill. */
  showMidgame(): Promise<void>;
  /** Rewarded ad. True only if the ad played to the end; adapters resolve false on any failure rather than reject. */
  showRewarded(): Promise<boolean>;
  save(key: string, value: string): Promise<void>;
  /** Untrusted: callers must validate whatever comes back. */
  load(key: string): Promise<string | null>;
  haptic?(kind: 'light' | 'success'): void;
  /** iOS and Android only. */
  purchaseRemoveAds?(): Promise<boolean>;
}
