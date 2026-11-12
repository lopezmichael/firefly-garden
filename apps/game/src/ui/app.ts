import { hintStep, PLAYER_CONFIG } from '@firefly/core';
import type { NextLevel, Transform } from '@firefly/core';
import type { Platform } from '../platform/index.ts';
import type { Catalog } from '../state/catalog.ts';
import { EVENT_LOG_KEY, EventLog, parseEventLog } from '../state/events.ts';
import type { EventBody } from '../state/events.ts';
import { Play } from '../state/play.ts';
import type { ShownHint } from '../state/play.ts';
import { DEFAULT_SETTINGS, newInstallId, parseSave, SAVE_KEY, serializeSave } from '../state/save.ts';
import type { CurrentPlay, MotionSetting, SaveData, Settings } from '../state/save.ts';
import { Session } from '../state/session.ts';
import { boardStatus, litPercent, noticeStatus } from '../state/status.ts';
import type { Notice } from '../state/status.ts';
import { Wallet } from '../state/wallet.ts';
import { BoardView } from '../view/board.ts';
import { bandFor, keepOrTurn, orientFor } from '../view/layout.ts';
import type { Palette } from '../view/theme.ts';
import { PlayScreen } from './screen.ts';
import { HintSheet, SettingsSheet } from './sheets.ts';

/**
 * The game controller: loads and validates saved progress, picks the next
 * level with the policy, runs a play, pays for hints, credits solves,
 * auto-advances, saves after every change and logs every analytics event.
 */

/** Seconds the solved board stays up before the next garden opens by itself. */
const AUTO_ADVANCE_MS = 3000;
/** A return after this long hidden starts a new analytics session. */
const SESSION_BREAK_MS = 30 * 60_000;
/** Saves are batched this long after a change (and flushed when the tab hides). */
const SAVE_DELAY_MS = 300;

interface Stored {
  readonly save: SaveData | null;
  readonly install: string;
  readonly events: ReturnType<typeof parseEventLog>;
}

export class GameApp {
  private readonly screen: PlayScreen;
  private readonly hintSheet = new HintSheet();
  private readonly settingsSheet: SettingsSheet;
  private board!: BoardView;
  private session!: Session;
  private wallet!: Wallet;
  private log!: EventLog;
  private install = '';
  private settings: Settings = DEFAULT_SETTINGS;
  private play: Play | null = null;
  private current: NextLevel | null = null;
  private attempt = 1;
  private transform: Transform = 'identity';
  private notice: Notice | null = null;
  private advanceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Auto-advance waits for the tab to be visible, so a hidden tab never starts a level's clock. */
  private advancePending = false;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Visible time in the current analytics session (hidden stretches excluded). */
  private sessionVisibleMs = 0;
  private visibleSince: number | null = null;
  private hiddenAt: number | null = null;
  /** True while a rewarded ad plays: the board, moves, hints and the level clock all wait. */
  private adShowing = false;
  private readonly clock = { now: () => performance.now() };
  private readonly wallClock = { now: () => Date.now() };
  private readonly reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(
    private readonly host: HTMLElement,
    private readonly catalog: Catalog,
    private readonly platform: Platform,
    private readonly palette: Palette,
  ) {
    this.screen = new PlayScreen({
      undo: () => this.move(() => this.play?.undo()),
      reset: () => this.move(() => {
        if (this.play?.placed.size) {
          this.play.reset();
          this.notice = { kind: 'reset' };
        }
      }),
      hint: () => void this.hint(),
      next: () => this.advance(),
      settings: () => this.openSettings(),
    });
    this.settingsSheet = new SettingsSheet({
      motion: (m) => this.setMotion(m),
      copyLog: () => this.copyLog(),
    });
    this.settingsSheet.onClose = () => this.resumeClock();
  }

  async start(): Promise<void> {
    const stored = await this.loadStored();
    this.restoreState(stored);
    this.host.replaceChildren(this.screen.root);
    this.screen.root.append(this.hintSheet.backdrop, this.settingsSheet.backdrop);
    const behind = () => [...this.screen.root.children].filter(
      (c): c is HTMLElement => c instanceof HTMLElement && c !== this.hintSheet.backdrop && c !== this.settingsSheet.backdrop);
    this.hintSheet.background = behind;
    this.settingsSheet.background = behind;
    this.updateBand();
    this.board = await BoardView.create(this.screen.boardHost, {
      palette: this.palette,
      reducedMotion: this.reducedMotion(),
      onTap: (cell) => this.tap(cell),
    });
    this.applyMotion();
    this.reducedQuery.addEventListener('change', () => this.applyMotion());
    new ResizeObserver(() => this.layout()).observe(this.screen.boardHost);
    window.addEventListener('resize', () => this.updateBand());
    document.addEventListener('visibilitychange', () => this.visibility());
    window.addEventListener('pagehide', () => this.flushSave());

    this.startSessionClock();
    this.emit({ type: 'session_start', platform: this.platform.name, coins: this.wallet.coins });

    const saved = stored.save?.current;
    if (!(saved && !this.session.isSolved(saved.levelId) && this.resume(saved))) this.advance();
    // Write back at once, so storage holds the validated version, not whatever was loaded.
    this.scheduleSave();
  }

  // ---------------------------------------------------------------- storage

  private async loadStored(): Promise<Stored> {
    const now = Date.now();
    const [rawSave, rawEvents] = await Promise.all([this.platform.load(SAVE_KEY), this.platform.load(EVENT_LOG_KEY)]);
    const freshId = () => newInstallId((n) => crypto.getRandomValues(new Uint8Array(n)));
    const parsed = parseSave(rawSave, this.catalog, now, freshId);
    // Problems mean a corrupt or edited save; the parser already fell back safely.
    if (parsed.problems.length > 0) console.warn('Saved progress had problems:', parsed.problems);
    // A save from another build version is kept aside before this build starts fresh over it.
    if (parsed.unknownVersion && rawSave !== null) await this.platform.save(`${SAVE_KEY}-backup`, rawSave);
    const install = parsed.data?.install ?? freshId();
    return { save: parsed.data, install, events: parseEventLog(rawEvents, new Set(this.catalog.levels.keys()), install) };
  }

  private restoreState({ save, install, events }: Stored): void {
    this.install = install;
    this.settings = save?.settings ?? DEFAULT_SETTINGS;
    this.log = new EventLog(this.install, (save?.session ?? 0) + 1, new Set(this.catalog.levels.keys()), this.wallClock, events.events);
    this.log.dropped = events.dropped;
    this.session = new Session(this.catalog, save && {
      solved: save.solved, history: save.history, playedReserve: save.playedReserve, quitMain: save.quitMain,
    });
    this.wallet = new Wallet(save && { coins: save.coins, bank: save.bank }, {
      coins: (delta, balance, why) => this.emit({ type: 'coins', delta, balance, why }),
    });
  }

  private snapshot(): SaveData {
    const p = this.play;
    const current: CurrentPlay | null = p && this.current && !p.solved
      ? {
        levelId: this.current.id, reason: this.current.reason,
        placed: [...p.placed], locked: [...p.locked], seconds: p.seconds,
        placements: p.placements, undos: p.undos, restarts: p.restarts, hints: p.hints,
      }
      : null;
    const pr = this.session.progress;
    return {
      install: this.install, session: this.log.session, coins: this.wallet.coins, bank: this.wallet.bank,
      solved: pr.solved, history: pr.history, playedReserve: pr.playedReserve, quitMain: pr.quitMain,
      current, settings: this.settings,
    };
  }

  private scheduleSave(): void {
    if (this.saveTimer !== null) return;
    this.saveTimer = setTimeout(() => this.flushSave(), SAVE_DELAY_MS);
  }

  private flushSave(): void {
    if (this.saveTimer !== null) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    void this.platform.save(SAVE_KEY, serializeSave(this.snapshot(), this.catalog));
    void this.platform.save(EVENT_LOG_KEY, this.log.serialize());
  }

  private emit(body: EventBody): void {
    // A refused event is a bug in how we build it; the log counts it and the play log shows it.
    if (!this.log.log(body)) console.warn('Analytics event refused by the schema:', body.type);
  }

  // ---------------------------------------------------------------- lifecycle

  private startSessionClock(): void {
    this.sessionVisibleMs = 0;
    this.visibleSince = document.hidden ? null : Date.now();
  }

  /** Visible seconds in this session so far (what `session_end.seconds` reports). */
  private sessionSeconds(): number {
    const live = this.visibleSince === null ? 0 : Date.now() - this.visibleSince;
    return Math.min(7 * 86_400 - 1, Math.max(0, Math.round((this.sessionVisibleMs + live) / 1000)));
  }

  private visibility(): void {
    if (document.hidden) {
      this.play?.pause();
      this.hiddenAt = Date.now();
      this.emit({ type: 'session_end', seconds: this.sessionSeconds() });
      if (this.visibleSince !== null) this.sessionVisibleMs += Date.now() - this.visibleSince;
      this.visibleSince = null;
      if (this.advanceTimer !== null) {
        clearTimeout(this.advanceTimer);
        this.advanceTimer = null;
        this.advancePending = true;
      }
      this.flushSave();
      return;
    }
    if (this.hiddenAt !== null && Date.now() - this.hiddenAt >= SESSION_BREAK_MS) {
      this.log.session++;
      this.startSessionClock();
      this.emit({ type: 'session_start', platform: this.platform.name, coins: this.wallet.coins });
      this.scheduleSave();
    } else {
      this.visibleSince = Date.now();
    }
    this.hiddenAt = null;
    this.resumeClock();
    if (this.advancePending) this.scheduleAdvance();
  }

  /** The level clock runs only while the board is visible and no sheet is open. */
  private resumeClock(): void {
    if (this.play && !this.play.solved && !document.hidden && !this.blocked()) this.play.resume();
  }

  /** A sheet or an ad is in front of the board: no taps, moves, hints or clock. */
  private blocked(): boolean {
    return this.adShowing || this.hintSheet.isOpen || this.settingsSheet.isOpen;
  }

  private reducedMotion(): boolean {
    return this.settings.motion === 'on' || (this.settings.motion === 'device' && this.reducedQuery.matches);
  }

  private applyMotion(): void {
    const reduced = this.reducedMotion();
    this.board.setReducedMotion(reduced);
    this.screen.setReducedMotion(reduced);
  }

  private setMotion(m: MotionSetting): void {
    this.settings = { ...this.settings, motion: m };
    this.applyMotion();
    this.scheduleSave();
  }

  private openSettings(): void {
    if (this.blocked()) return;
    this.play?.pause();
    const s = this.log.summary();
    this.settingsSheet.open({ motion: this.settings.motion, played: s.played, solved: s.solved, hints: s.hints });
  }

  private async copyLog(): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(this.log.serialize());
      return true;
    } catch (err) {
      // Clipboard can be refused (permissions, insecure context): tell the player, keep the log.
      console.warn('Copy failed:', err);
      return false;
    }
  }

  private updateBand(): void {
    this.screen.setBand(bandFor(window.innerWidth, window.innerHeight));
  }

  private layout(): void {
    const { clientWidth: w, clientHeight: h } = this.screen.boardHost;
    if (this.play) {
      const lvl = this.play.board;
      const next = keepOrTurn(this.transform, lvl.w, lvl.h, w, h);
      if (next !== this.transform) {
        this.transform = next;
        this.board.setTransform(next);
      }
    }
    this.board.resize(w, h);
  }

  // ---------------------------------------------------------------- levels

  private scheduleAdvance(): void {
    this.advancePending = false;
    if (document.hidden) {
      this.advancePending = true;
      return;
    }
    this.advanceTimer = setTimeout(() => this.advance(), AUTO_ADVANCE_MS);
  }

  private advance(): void {
    if (this.advanceTimer !== null) clearTimeout(this.advanceTimer);
    this.advanceTimer = null;
    this.advancePending = false;
    const next = this.session.next(Date.now());
    if (!next) {
      this.finished();
      return;
    }
    const board = this.catalog.board(next.id);
    this.attempt = this.session.attempt(next.id);
    this.show(next, new Play(board, this.catalog.solution(next.id), this.clock));
    this.emit({ type: 'level_start', level: next.id, reason: next.reason, attempt: this.attempt });
    this.scheduleSave();
  }

  /** Put a saved, validated play back on the board. False if it can't be (then the policy picks). */
  private resume(saved: CurrentPlay): boolean {
    let play: Play;
    try {
      play = new Play(this.catalog.board(saved.levelId), this.catalog.solution(saved.levelId), this.clock, saved);
    } catch (err) {
      // parseSave already validated every cell; a throw here is a validation bug. Start the level fresh.
      console.warn('Could not resume the saved board:', err);
      return false;
    }
    if (play.solved) return false;
    this.attempt = this.session.attempt(saved.levelId);
    this.show({ id: saved.levelId, reason: saved.reason }, play);
    return true;
  }

  private show(next: NextLevel, play: Play): void {
    this.current = next;
    this.play = play;
    this.notice = null;
    const board = play.board;
    const { clientWidth: w, clientHeight: h } = this.screen.boardHost;
    this.transform = orientFor(board.w, board.h, w, h);
    this.board.setLevel(board, this.transform);
    this.board.resize(w, h);

    const place = this.catalog.place(next.id);
    const chapter = place?.chapter ?? this.chapterForProgress();
    const dots = chapter.levels.map((id, i): 'done' | 'now' | 'todo' =>
      place && i === place.index ? 'now' : this.session.isSolved(id) ? 'done' : 'todo');
    const label = place
      ? `Garden ${place.index + 1} of ${chapter.levels.length}`
      : 'Bonus garden';
    this.screen.setChapter(label, `The ${chapter.area}`, dots);
    this.refresh(true);
    this.resumeClock();
    this.platform.gameplayStart();
  }

  /** For a detour level: the chapter of the next main-path level, for the progress dots. */
  private chapterForProgress() {
    const nextMain = this.catalog.mainPath.find((id) => !this.session.isSolved(id));
    return (nextMain && this.catalog.place(nextMain)?.chapter) || this.catalog.chapters[this.catalog.chapters.length - 1]!;
  }

  // ---------------------------------------------------------------- moves

  private tap(cell: number): void {
    const play = this.play;
    if (!play || play.solved || this.blocked()) return;
    const r = play.tap(cell);
    if (r === 'blocked') return;
    this.notice = r === 'locked' ? { kind: 'locked' } : null;
    this.refresh();
    if (r === 'placed') this.platform.haptic?.('light');
    if (play.solved) this.solved();
    else this.scheduleSave();
  }

  private move(fn: () => void): void {
    const play = this.play;
    if (!play || play.solved || this.blocked()) return;
    this.notice = null;
    play.dismissHint();
    fn();
    this.refresh();
    // An undo can land on a solved board (a hint rewrote the history): credit it like any solve.
    if (play.solved) this.solved();
    else this.scheduleSave();
  }

  private async hint(): Promise<void> {
    const play = this.play;
    if (!play || play.solved || this.blocked() || play.peekHint().kind === 'none') return;
    play.pause();
    const choice = await this.hintSheet.ask({
      bank: this.wallet.bank, coins: this.wallet.coins, cost: this.wallet.economy.hintCost,
      rewardedAds: this.platform.rewardedAds, coinsPerSolve: this.wallet.economy.coinsPerSolve,
    });
    // The sheet resolves after it closes; the board may have changed meanwhile only if the play did.
    if (this.play !== play || play.solved) return;
    let source: 'bank' | 'coins' | 'ad' | null = null;
    if (choice === 'pay') {
      source = this.wallet.payForHint();
    } else if (choice === 'ad' && this.platform.rewardedAds) {
      const started = Date.now();
      this.adShowing = true;
      let completed = false;
      try {
        completed = await this.platform.showRewarded();
      } finally {
        this.adShowing = false;
      }
      this.emit({ type: 'ad', kind: 'rewarded', completed, seconds: Math.round((Date.now() - started) / 1000) });
      // Credited only when the ad finished (rules.md); a failed or skipped ad charges and credits nothing.
      if (completed && this.play === play && !play.solved) {
        this.wallet.creditAd();
        source = 'ad';
      }
    }
    this.resumeClock();
    if (!source) {
      if (choice === 'pay') this.notice = { kind: 'no-coins', coinsPerSolve: this.wallet.economy.coinsPerSolve };
      this.refresh();
      return;
    }
    const h = play.applyHint();
    if (h.kind === 'none') return;
    this.emit({ type: 'hint', level: this.current!.id, source, step: hintStep(this.catalog.grade(this.current!.id), h.cell) });
    this.notice = { kind: 'hint', hint: h };
    this.refresh(false, h.kind === 'remove' ? h.cell : null);
    if (play.solved) this.solved();
    else this.scheduleSave();
  }

  private solved(): void {
    const play = this.play!;
    const cur = this.current!;
    play.pause();
    this.platform.gameplayStop();
    this.platform.haptic?.('success');
    this.wallet.creditSolve();
    this.session.record({ levelId: cur.id, reason: cur.reason, solved: true, seconds: play.seconds, hints: play.hints, endedAt: Date.now() });
    this.emit({
      type: 'level_end', level: cur.id, reason: cur.reason, attempt: this.attempt, outcome: 'solved', seconds: play.seconds,
      placements: play.placements, undos: play.undos, restarts: play.restarts, hints: play.hints,
    });
    this.refresh();
    this.flushSave();
    this.screen.announce('Solved! The garden is glowing.');
    this.screen.focusNext();
    this.scheduleAdvance();
  }

  private finished(): void {
    this.play = null;
    this.current = null;
    this.screen.setStatus({ title: 'The Rose Bed is glowing!', sub: 'You lit every garden in this build. More gardens are on the way.', tone: 'solved' }, 100, false);
    this.screen.setMoves(false, false, true);
    this.scheduleSave();
  }

  private refresh(quiet = false, removed: number | null = null): void {
    const play = this.play;
    if (!play) return;
    const ev = play.evaluation;
    const shown: ShownHint | null = play.shown;
    this.board.render({
      evaluation: ev,
      locked: play.locked,
      because: new Set(shown?.kind === 'place' ? shown.because : []),
      ruledOut: new Set(shown?.kind === 'place' ? shown.ruledOut : []),
      solved: ev.solved,
    }, { quiet, removed });
    const status = ev.solved || !this.notice
      ? boardStatus(ev, play.placements === 0 && play.locked.size === 0, PLAYER_CONFIG.economy.coinsPerSolve)
      : noticeStatus(this.notice, ev);
    this.screen.setStatus(status, litPercent(ev, play.board.needsLight.length), ev.solved);
    this.screen.setMoves(play.canUndo, play.placed.size > 0, ev.solved);
    this.screen.setCoins(this.wallet.coins, this.wallet.economy.hintCost, this.wallet.bank);
  }
}
