import { PLAYER_CONFIG } from '@firefly/core';
import type { Economy, HintSource } from '@firefly/core';

/**
 * Coins and the saved-hint bank. Every number comes from the shipped economy
 * (`PLAYER_CONFIG.economy`); nothing is restated here. Every balance change
 * goes through `change`, which tells the listener (the analytics `coins`
 * event) so no change can go unlogged.
 */

export type CoinReason = 'solve' | 'hint' | 'doubler' | 'start';

export interface WalletListener {
  coins?(delta: number, balance: number, why: CoinReason): void;
}

/** Upper bound on banked hints, so a corrupt save can never grant unlimited hints. */
export const MAX_BANKED_HINTS = 99;

export class Wallet {
  readonly economy: Economy;
  private coinsValue: number;
  private bankValue: number;
  private readonly listener: WalletListener;

  constructor(state: { coins: number; bank: number } | null, listener: WalletListener = {}, economy: Economy = PLAYER_CONFIG.economy) {
    this.economy = economy;
    this.listener = listener;
    this.coinsValue = 0;
    this.bankValue = state ? state.bank : 0;
    if (state) this.coinsValue = state.coins;
    else this.change(economy.startingCoins, 'start');
  }

  get coins(): number {
    return this.coinsValue;
  }

  get bank(): number {
    return this.bankValue;
  }

  /** How the next hint would be paid for without an ad, or null if it can't be. */
  hintSource(): Exclude<HintSource, 'ad'> | null {
    if (this.bankValue > 0) return 'bank';
    if (this.coinsValue >= this.economy.hintCost) return 'coins';
    return null;
  }

  /** Pays for one hint from the bank, else coins. Returns the source, or null (nothing charged). */
  payForHint(): Exclude<HintSource, 'ad'> | null {
    const source = this.hintSource();
    if (source === 'bank') this.bankValue--;
    else if (source === 'coins') this.change(-this.economy.hintCost, 'hint');
    return source;
  }

  /**
   * A rewarded ad finished: one hint is used now, the rest are banked. Call
   * only after `Platform.showRewarded()` resolved true (rules.md).
   */
  creditAd(): void {
    this.bankValue = Math.min(MAX_BANKED_HINTS, this.bankValue + this.economy.hintsPerAd - 1);
  }

  creditSolve(): void {
    this.change(this.economy.coinsPerSolve, 'solve');
  }

  private change(delta: number, why: CoinReason): void {
    this.coinsValue = Math.max(0, this.coinsValue + delta);
    this.listener.coins?.(delta, this.coinsValue, why);
  }
}
