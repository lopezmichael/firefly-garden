import { hintStep, PLAYER_CONFIG } from '@firefly/core';
import type { Evaluation, NextLevel, Transform } from '@firefly/core';
import { AudioEngine } from '../audio/engine.ts';
import type { AudioState, Voice } from '../audio/engine.ts';
import type { Platform, TestPlatform } from '../platform/index.ts';
import type { Catalog } from '../state/catalog.ts';
import { EVENT_LOG_KEY, EventLog, parseEventLog } from '../state/events.ts';
import type { EventBody } from '../state/events.ts';
import { Play } from '../state/play.ts';
import type { ShownHint } from '../state/play.ts';
import { DEFAULT_SETTINGS, MAX_PARKED, newInstallId, parseSave, SAVE_KEY, serializeSave } from '../state/save.ts';
import type { CurrentPlay, MotionSetting, SaveData, Settings } from '../state/save.ts';
import { Session } from '../state/session.ts';
import { cuesFor } from '../state/cues.ts';
import type { Cue, Move } from '../state/cues.ts';
import { describeCell } from '../state/describe.ts';
import { boardStatus, completeLine, finishedStatus, noticeStatus } from '../state/status.ts';
import type { Notice, StatusText } from '../state/status.ts';
import { conflictWords, crossTipDue } from '../state/teach.ts';
import type { TipId } from '../state/teach.ts';
import { Wallet } from '../state/wallet.ts';
import { BoardView } from '../view/board.ts';
import { bandFor, canonicalCell, displayCell, displayDims, keepOrTurn, keyAction, orientFor, stepFocus } from '../view/layout.ts';
import type { Palette } from '../view/theme.ts';
import { cancelFlights, fly, FLIGHT_MS } from './flight.ts';
import { PlayScreen } from './screen.ts';
import { HintSheet, SettingsSheet } from './sheets.ts';
import { MapScreen } from './map.ts';
import type { BedView } from './map.ts';

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

/** Which voice each cue plays (placeholder sounds; the voices live in audio/engine.ts). */
const VOICE: { readonly [K in Cue['kind']]: Voice } = {
  place: 'chime', hint: 'sparkle', lift: 'lift', bush: 'bell', conflict: 'buzz', solve: 'flourish', empty: 'bump',
};

/** What the end-to-end tests read and drive (built only with `--mode e2e`). */
export interface E2EHooks {
  level(): {
    id: string; transform: Transform; w: number; h: number; placed: number[]; locked: number[];
    /** The answer's cells the player places (lanterns excluded). */
    answer: number[];
    canUndo: boolean; seconds: number; solved: boolean; remaining: number; notice: string | null; focus: number | null;
  } | null;
  cellPoint(cell: number): { x: number; y: number } | null;
  wallet(): { coins: number; bank: number };
  tips(): string[];
  audio(): AudioState;
  setStatus(s: StatusText): void;
  refresh(): void;
  /** Open a garden directly (perf checks on the largest boards). */
  openLevel(id: string): void;
  frames(): { count: number; ms: number };
  platform: TestPlatform;
}

interface Stored {
  readonly save: SaveData | null;
  readonly install: string;
  readonly events: ReturnType<typeof parseEventLog>;
}

export class GameApp {
  private readonly screen: PlayScreen;
  private readonly hintSheet = new HintSheet();
  private readonly settingsSheet: SettingsSheet;
  private readonly mapScreen: MapScreen;
  /** Boards of levels left unsolved, kept so their retry resumes them (newest last). */
  private parked: CurrentPlay[] = [];
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
  private boardArea = { w: 0, h: 0 };
  private readonly audio = new AudioEngine();
  /** One-time tips already shown (saved). */
  private tips = new Set<TipId>();
  /** Keyboard focus as a canonical cell, and whether its ring shows (only after keyboard use). */
  private focusCell: number | null = null;
  private focusRing = false;
  /** A landing sound waiting for its firefly to arrive; cancelled by the next move or level. */
  private cueTimer: ReturnType<typeof setTimeout> | null = null;
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
      undo: () => this.undo(),
      reset: () => this.move('reset', () => {
        if (this.play?.placed.size) {
          this.play.reset();
          this.notice = { kind: 'reset' };
        }
      }),
      hint: () => void this.hint(),
      next: () => this.advance(),
      settings: () => this.openSettings(),
      map: () => this.openMap(),
    });
    this.mapScreen = new MapScreen({
      continue: () => this.leaveMap(),
      settings: () => this.openSettings(),
    });
    this.settingsSheet = new SettingsSheet({
      sound: (on) => this.setSound(on),
      motion: (m) => this.setMotion(m),
      copyLog: () => this.copyLog(),
    });
    this.settingsSheet.onClose = () => {
      this.resumeClock();
      if (this.advancePending) this.scheduleAdvance();
    };
  }

  async start(): Promise<void> {
    const stored = await this.loadStored();
    this.restoreState(stored);
    this.host.replaceChildren(this.screen.root);
    this.screen.root.append(this.mapScreen.root, this.hintSheet.backdrop, this.settingsSheet.backdrop);
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
    // Sound starts on the first gesture (autoplay policy); muted by the setting, a hidden tab or an ad.
    // pointerdown is a gesture only for a mouse: touch activates on pointerup/touchend/click, and
    // WebKit (iOS) unlocks audio only from touchend or click. Listen to all; unlock is idempotent.
    const unlock = () => this.audio.unlock();
    for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) document.addEventListener(type, unlock, true);
    this.audio.setMuted('setting', !this.settings.sound);
    this.audio.setMuted('hidden', document.hidden);
    this.setupKeyboard();
    if (import.meta.env.DEV) this.fpsMeter();
    new ResizeObserver(() => this.layout()).observe(this.screen.boardHost);
    window.addEventListener('resize', () => this.updateBand());
    document.addEventListener('visibilitychange', () => this.visibility());
    window.addEventListener('pagehide', () => this.flushSave());

    this.startSessionClock();
    this.emit({ type: 'session_start', platform: this.platform.name, coins: this.wallet.coins });

    // Launch: back into an unfinished board; a first-time player straight into the first garden;
    // anyone else to the map, with Continue.
    const saved = stored.save?.current;
    if (!(saved && !this.session.isSolved(saved.levelId) && this.resume(saved))) {
      if (this.session.progress.history.length === 0) this.advance();
      else this.showMap();
    }
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
    this.tips = new Set(save?.tips ?? []);
    this.parked = [...(save?.parked ?? [])];
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
        levelId: this.current.id, key: this.catalog.levelKey(this.current.id), reason: this.current.reason,
        placed: [...p.placed], locked: [...p.locked], seconds: p.seconds,
        placements: p.placements, undos: p.undos, restarts: p.restarts, hints: p.hints,
      }
      : null;
    const pr = this.session.progress;
    return {
      install: this.install, session: this.log.session, coins: this.wallet.coins, bank: this.wallet.bank,
      solved: pr.solved, history: pr.history, playedReserve: pr.playedReserve, quitMain: pr.quitMain,
      current, parked: this.parked, settings: this.settings, tips: this.tips,
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
    this.audio.setMuted('hidden', document.hidden);
    if (document.hidden) {
      this.play?.pause();
      this.hiddenAt = Date.now();
      this.emit({ type: 'session_end', seconds: this.sessionSeconds() });
      if (this.visibleSince !== null) this.sessionVisibleMs += Date.now() - this.visibleSince;
      this.visibleSince = null;
      this.holdAdvance();
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
    // A still board stopped drawing; the browser may have dropped its canvas while hidden.
    this.board.redraw();
    this.resumeClock();
    if (this.advancePending) this.scheduleAdvance();
  }

  /** The level clock runs only while the board is visible and no sheet is open. */
  private resumeClock(): void {
    if (this.play && !this.play.solved && !document.hidden && !this.blocked()) this.play.resume();
  }

  /** A sheet or an ad is in front of the board: no taps, moves, hints or clock. */
  private blocked(): boolean {
    return this.adShowing || this.hintSheet.isOpen || this.settingsSheet.isOpen || this.mapScreen.isOpen;
  }

  private reducedMotion(): boolean {
    return this.settings.motion === 'on' || (this.settings.motion === 'device' && this.reducedQuery.matches);
  }

  private applyMotion(): void {
    const reduced = this.reducedMotion();
    this.board.setReducedMotion(reduced);
    this.screen.setReducedMotion(reduced);
  }

  private setSound(on: boolean): void {
    this.settings = { ...this.settings, sound: on };
    this.audio.setMuted('setting', !on);
    this.scheduleSave();
  }

  private setMotion(m: MotionSetting): void {
    this.settings = { ...this.settings, motion: m };
    this.applyMotion();
    this.scheduleSave();
  }

  private openSettings(): void {
    if (this.adShowing || this.hintSheet.isOpen || this.settingsSheet.isOpen) return;
    this.play?.pause();
    this.holdAdvance();
    const s = this.log.summary();
    this.settingsSheet.open({ sound: this.settings.sound, motion: this.settings.motion, played: s.played, solved: s.solved, hints: s.hints });
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
    // Flights aim at screen positions: only a real change of the board area invalidates them.
    if (w !== this.boardArea.w || h !== this.boardArea.h) cancelFlights();
    this.boardArea = { w, h };
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

  /** Arm the auto-advance (the complete card's ring counts it down), unless the tab is hidden or a
   *  sheet is open: then it waits, and is re-armed from full when the player is back. */
  private scheduleAdvance(): void {
    if (this.advanceTimer !== null) clearTimeout(this.advanceTimer);
    this.advanceTimer = null;
    this.advancePending = false;
    if (document.hidden || this.blocked()) {
      this.advancePending = true;
      this.screen.holdCountdown();
      return;
    }
    this.advanceTimer = setTimeout(() => this.advance(), AUTO_ADVANCE_MS);
    this.screen.countdown(AUTO_ADVANCE_MS);
  }

  /** Put an armed auto-advance on hold (the tab hid, a sheet opened). */
  private holdAdvance(): void {
    if (this.advanceTimer === null) return;
    clearTimeout(this.advanceTimer);
    this.advanceTimer = null;
    this.advancePending = true;
    this.screen.holdCountdown();
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
    // A keyboard player pressed Next (focus sat on the complete card, about to hide): carry on on the board.
    const handOff = this.screen.completeHasFocus();
    this.show(next, this.unpark(next.id) ?? new Play(board, this.catalog.solution(next.id), this.clock));
    this.emit({ type: 'level_start', level: next.id, reason: next.reason, attempt: this.attempt });
    if (handOff) this.screen.boardHost.focus({ preventScroll: true });
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

  /** A parked board for this level, resumed (and no longer parked); undefined if none or unusable. */
  private unpark(levelId: string): Play | undefined {
    const i = this.parked.findIndex((p) => p.levelId === levelId);
    if (i < 0) return undefined;
    const [saved] = this.parked.splice(i, 1);
    try {
      // The retry keeps the board's fireflies but starts its own counters: its level_end and
      // history describe this attempt, so breather triggers (long solve, hint streak) stay fair.
      const play = new Play(this.catalog.board(levelId), this.catalog.solution(levelId), this.clock, { placed: saved!.placed, locked: saved!.locked });
      // A parked board can't be already solved (only edited saves get here): start fresh instead.
      return play.solved ? undefined : play;
    } catch (err) {
      // parseSave validated it; a throw is a validation bug. The retry starts fresh instead.
      console.warn('Could not resume the parked board:', err);
      return undefined;
    }
  }

  // ---------------------------------------------------------------- map

  /** Leave the board for the map. An unsolved level counts as a quit; its board is parked. */
  private openMap(): void {
    if (this.blocked()) return;
    if (this.advanceTimer !== null) clearTimeout(this.advanceTimer);
    this.advanceTimer = null;
    this.advancePending = false;
    cancelFlights();
    this.cancelCues();
    const play = this.play, cur = this.current;
    // Peeking at the map from an untouched board is not a quit: the board waits, unchanged.
    const untouched = play !== null && play.placements === 0 && play.undos === 0 && play.hints === 0 && play.restarts === 0;
    if (play && cur && !play.solved && untouched) {
      play.pause();
      this.showMap();
      return;
    }
    if (play && cur && !play.solved) {
      play.pause();
      this.platform.gameplayStop();
      const endedAt = Date.now();
      this.session.record({ levelId: cur.id, reason: cur.reason, solved: false, seconds: play.seconds, hints: play.hints, endedAt });
      this.emit({
        type: 'level_end', level: cur.id, reason: cur.reason, attempt: this.attempt, outcome: 'quit', seconds: play.seconds,
        placements: play.placements, undos: play.undos, restarts: play.restarts, hints: play.hints,
      });
      // Only main-path boards come back (as a retry); a quit detour is never served again.
      this.parked = this.parked.filter((p) => p.levelId !== cur.id);
      if (this.catalog.mainIds.has(cur.id)) {
        this.parked.push({
          levelId: cur.id, key: this.catalog.levelKey(cur.id), reason: cur.reason,
          placed: [...play.placed], locked: [...play.locked], seconds: play.seconds,
          placements: play.placements, undos: play.undos, restarts: play.restarts, hints: play.hints,
        });
        this.parked = this.parked.slice(-MAX_PARKED);
      }
      this.play = null;
      this.current = null;
    }
    this.showMap();
    this.flushSave();
  }

  private showMap(): void {
    const solved = (id: string) => this.session.isSolved(id);
    const nextMain = this.catalog.mainPath.find((id) => !solved(id));
    const nextPlace = nextMain ? this.catalog.place(nextMain) : undefined;
    const beds: BedView[] = this.catalog.chapters.map((ch, i) => {
      const done = ch.levels.filter(solved).length;
      const state = done === ch.levels.length ? 'done' : nextPlace?.chapter.id === ch.id ? 'now' : 'dark';
      return { title: `Chapter ${i + 1}`, solved: done, total: ch.levels.length, state };
    });
    const chapterNo = nextPlace ? this.catalog.chapters.findIndex((c) => c.id === nextPlace.chapter.id) + 1 : 0;
    for (const el of this.mapBackground()) el.inert = true;
    this.mapScreen.show({
      area: (nextPlace?.chapter ?? this.catalog.chapters[0])?.area ?? 'Garden',
      solved: this.catalog.mainPath.filter(solved).length,
      total: this.catalog.mainPath.length,
      beds,
      coins: this.wallet.coins,
      continueLabel: nextMain ? 'Continue' : 'Every garden is glowing',
      continueSub: nextPlace ? `Chapter ${chapterNo} · Garden ${nextPlace.index + 1}` : 'More gardens are on the way',
      finished: !nextMain,
    });
  }

  private leaveMap(): void {
    this.mapScreen.hide();
    for (const el of this.mapBackground()) el.inert = false;
    // An untouched board was left waiting behind the map: go back to it.
    if (this.play && !this.play.solved && this.current) {
      this.resumeClock();
      this.screen.focusMap();
      return;
    }
    this.advance();
    this.screen.focusMap();
  }

  /** The play screen under the map: inert while the map is open (focus and screen readers). */
  private mapBackground(): HTMLElement[] {
    return [...this.screen.root.children].filter((c): c is HTMLElement =>
      c instanceof HTMLElement && c !== this.mapScreen.root && c !== this.hintSheet.backdrop && c !== this.settingsSheet.backdrop);
  }

  private show(next: NextLevel, play: Play): void {
    cancelFlights();
    this.cancelCues();
    this.screen.hideComplete();
    this.current = next;
    this.play = play;
    this.notice = null;
    this.focusCell = null;
    this.focusRing = false;
    this.board.setFocus(null);
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

  private tap(cell: number, viaKeyboard = false): void {
    const play = this.play;
    if (!play || play.solved || this.blocked()) return;
    if (!viaKeyboard) {
      // A pointer tap moves the keyboard's place too, but hides the ring until a key is used.
      this.focusCell = cell;
      this.focusRing = false;
      this.board.setFocus(null);
    }
    this.cancelCues();
    const before = play.evaluation;
    const r = play.tap(cell);
    if (r === 'blocked') return;
    if (r === 'jar-empty') {
      this.notice = { kind: 'jar-empty' };
      this.screen.shakeJar();
      this.playCues(cuesFor(before, play.evaluation, { kind: 'jar-empty' }));
      this.refresh();
      if (viaKeyboard) this.screen.announce('The jar is empty. Call a firefly back first.');
      return;
    }
    this.notice = r === 'locked' ? { kind: 'locked' } : null;
    // First crossing beams in an opening garden: say once that light may cross (feedback 2026-11-12).
    if (r === 'placed' && this.current && crossTipDue({
      opening: this.isOpening(this.current.id), seen: this.tips.has('cross'), board: play.board,
      before: before.fireflies, after: play.evaluation.fireflies, evaluation: play.evaluation,
    })) {
      this.tips.add('cross');
      this.notice = { kind: 'tip-cross' };
    }
    // A placed firefly flies out of the jar and lands when it arrives; a lifted one flies home.
    const flew = r === 'placed' ? this.flight(cell, 'out', false) : r === 'removed' ? this.flight(cell, 'home', false) : false;
    if (r === 'placed' || r === 'removed') {
      this.playCues(cuesFor(before, play.evaluation, r === 'placed' ? this.placeMove('placed', cell) : { kind: 'removed' }), flew ? FLIGHT_MS - 80 : 0);
    }
    this.refresh(false, null, flew && r === 'placed' ? cell : null);
    if (viaKeyboard) this.announceFocus(true);
    if (r === 'placed') this.platform.haptic?.('light');
    if (play.solved) this.solved();
    else this.scheduleSave();
  }

  private undo(): void {
    this.move('undo', () => {
      if (this.play?.undo() === 'jar-full') {
        this.notice = { kind: 'jar-empty' };
        this.screen.shakeJar();
        this.playCues([{ kind: 'empty' }]);
      }
    });
  }

  private move(kind: 'undo' | 'reset', fn: () => void): void {
    const play = this.play;
    if (!play || play.solved || this.blocked()) return;
    this.notice = null;
    play.dismissHint();
    this.cancelCues();
    const before = play.evaluation;
    fn();
    if (play.evaluation !== before) this.playCues(cuesFor(before, play.evaluation, { kind }));
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
      this.audio.setMuted('ad', true);
      let completed = false;
      try {
        completed = await this.platform.showRewarded();
      } catch (err) {
        // An adapter that rejects instead of resolving false (real SDKs do): no credit, carry on.
        console.warn('Rewarded ad failed:', err);
        completed = false;
      } finally {
        this.adShowing = false;
        this.audio.setMuted('ad', false);
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
    const before = play.evaluation;
    const h = play.applyHint();
    if (h.kind === 'none') return;
    this.emit({ type: 'hint', level: this.current!.id, source, step: hintStep(this.catalog.grade(this.current!.id), h.cell) });
    this.notice = { kind: 'hint', hint: h };
    // A placing hint sends a gold firefly from the jar; a removal sends the wrong one home.
    const flew = this.flight(h.cell, h.kind === 'remove' ? 'home' : 'out', h.kind !== 'remove');
    this.playCues(cuesFor(before, play.evaluation, h.kind === 'remove' ? { kind: 'hint-removed' } : this.placeMove('hint-placed', h.cell)),
      flew && h.kind !== 'remove' ? FLIGHT_MS - 80 : 0);
    this.refresh(false, flew ? null : h.kind === 'remove' ? h.cell : null, flew && h.kind !== 'remove' ? h.cell : null);
    if (play.solved) this.solved();
    else this.scheduleSave();
  }

  private solved(): void {
    const play = this.play!;
    const cur = this.current!;
    play.pause();
    this.platform.gameplayStop();
    this.platform.haptic?.('success');
    const before = this.wallet.coins;
    this.wallet.creditSolve();
    this.session.record({ levelId: cur.id, reason: cur.reason, solved: true, seconds: play.seconds, hints: play.hints, endedAt: Date.now() });
    this.emit({
      type: 'level_end', level: cur.id, reason: cur.reason, attempt: this.attempt, outcome: 'solved', seconds: play.seconds,
      placements: play.placements, undos: play.undos, restarts: play.restarts, hints: play.hints,
    });
    this.refresh();
    this.flushSave();
    const sub = this.solvedLine(cur.id, play.seconds, play.hints);
    const coins = this.wallet.coins - before;
    // The policy is pure: peek whether another garden follows (none after the last one).
    const more = this.session.next(Date.now()) !== null;
    this.screen.showComplete({ sub, coins, more }, true);
    this.screen.announce(`Solved! The garden is glowing. ${sub} ${coins} coins earned.`);
    this.screen.focusNext();
    if (more) this.scheduleAdvance();
  }

  /** The complete card's line: which garden, how long, and any hints. */
  private solvedLine(levelId: string, seconds: number, hints: number): string {
    const place = this.catalog.place(levelId);
    return completeLine(place
      ? { kind: 'main', index: place.index, total: place.chapter.levels.length, area: place.chapter.area }
      : { kind: 'bonus', area: this.chapterForProgress().area }, seconds, hints);
  }

  private finished(): void {
    this.play = null;
    this.current = null;
    this.screen.hideComplete();
    this.screen.setStatus(finishedStatus());
    this.screen.setMoves(false, false, true);
    this.screen.setJar(0, 0);
    this.scheduleSave();
  }

  /** The opening gardens (chapter 1 of the main path), where one-time tips may show. */
  private isOpening(levelId: string): boolean {
    return this.catalog.place(levelId)?.chapter.id === this.catalog.chapters[0]?.id;
  }

  /** A placement as a sound move: its row as drawn on screen, so higher tiles ring higher. */
  private placeMove(kind: 'placed' | 'hint-placed', cell: number): Move {
    const b = this.play!.board;
    return { kind, row: displayCell(this.transform, b.w, b.h, cell)[0], rows: displayDims(this.transform, b.w, b.h)[1] };
  }

  /** Play cues now, or after `delayMs` (a firefly still flying in rings when it lands). */
  private playCues(cues: readonly Cue[], delayMs = 0): void {
    if (cues.length === 0) return;
    const go = () => {
      for (const c of cues) this.audio.play(VOICE[c.kind], c.kind === 'place' || c.kind === 'hint' ? c.pitch : 0.5);
    };
    // The solve flourish never waits: the complete card is already up.
    this.cancelCues();
    if (delayMs <= 0 || cues.some((c) => c.kind === 'solve')) go();
    else this.cueTimer = setTimeout(() => {
      this.cueTimer = null;
      go();
    }, delayMs);
  }

  /** Drop a landing sound still waiting (its firefly was lifted, the level changed). */
  private cancelCues(): void {
    if (this.cueTimer !== null) clearTimeout(this.cueTimer);
    this.cueTimer = null;
  }

  // ---------------------------------------------------------------- keyboard

  /** Arrows move a focus ring over the board, space/enter toggles, Z undoes, H hints (plan E). */
  private setupKeyboard(): void {
    const host = this.screen.boardHost;
    host.tabIndex = 0;
    host.setAttribute('aria-roledescription', 'puzzle board');
    host.setAttribute('aria-label', 'Garden board. Arrow keys move, space places or lifts a firefly, Z undoes, H asks for a hint.');
    host.addEventListener('focus', () => {
      // A mouse or touch focus shows no ring; keyboard focus (Tab) does.
      if (host.matches(':focus-visible')) this.showFocus();
    });
    host.addEventListener('blur', () => {
      this.focusRing = false;
      this.board.setFocus(null);
    });
    document.addEventListener('keydown', (e) => this.key(e));
  }

  private key(e: KeyboardEvent): void {
    if (e.defaultPrevented) return;
    const a = keyAction(e);
    const play = this.play;
    if (!a || !play || play.solved || this.blocked()) return;
    const t = e.target;
    if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
    if (a.kind === 'undo') {
      e.preventDefault();
      this.undo();
      return;
    }
    if (a.kind === 'hint') {
      e.preventDefault();
      if (!e.repeat) void this.hint();
      return;
    }
    // Arrows and space/enter belong to the board only while it has focus; elsewhere they work buttons.
    if (document.activeElement !== this.screen.boardHost) return;
    e.preventDefault();
    if (this.focusCell === null || !this.focusRing) {
      this.showFocus();
      if (a.kind === 'move') return;
    }
    const b = play.board;
    if (a.kind === 'move') {
      this.focusCell = stepFocus(this.transform, b.w, b.h, this.focusCell!, a.dir, (c) => b.kind[c] === 'void');
      this.board.setFocus(this.focusCell);
      this.announceFocus(false);
    } else if (!e.repeat && b.kind[this.focusCell!] === 'path') {
      this.tap(this.focusCell!, true);
    }
  }

  private showFocus(): void {
    const play = this.play;
    if (!play) return;
    this.focusCell ??= this.firstFocus();
    this.focusRing = true;
    this.board.setFocus(this.focusCell);
    this.announceFocus(false);
  }

  /** The top-left garden cell as drawn on screen. */
  private firstFocus(): number {
    const b = this.play!.board;
    const [cols, rows] = displayDims(this.transform, b.w, b.h);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = canonicalCell(this.transform, b.w, b.h, r, c);
        if (b.kind[i] !== 'void') return i;
      }
    }
    return 0;
  }

  /** Tell screen readers what the focused cell holds (and who sees whom, after a toggle). */
  private announceFocus(afterToggle: boolean): void {
    const play = this.play;
    if (!play || this.focusCell === null) return;
    const b = play.board, ev: Evaluation = play.evaluation;
    const name = (c: number) => {
      const [r, col] = displayCell(this.transform, b.w, b.h, c);
      return `row ${r + 1}, column ${col + 1}`;
    };
    const [r, c] = displayCell(this.transform, b.w, b.h, this.focusCell);
    let text = describeCell(b, ev, play.locked, this.focusCell, r, c);
    if (afterToggle && !ev.solved) text += `. ${play.remaining} in the jar.`;
    const clash = afterToggle && ev.conflicts.includes(this.focusCell) ? conflictWords(b, ev.fireflies, name) : null;
    if (clash) text += ` ${clash}`;
    // A solve announces itself (the complete card); don't talk over it.
    if (!ev.solved) this.screen.announce(text);
  }

  /** Dev builds only: frames per second in a corner ("still" while the board draws nothing). */
  private fpsMeter(): void {
    const meter = document.createElement('div');
    meter.className = 'ff-fps';
    meter.setAttribute('aria-hidden', 'true');
    this.screen.root.append(meter);
    let last = this.board.frameStats(), at = performance.now();
    setInterval(() => {
      const now = this.board.frameStats(), t = performance.now();
      const fps = ((now.count - last.count) * 1000) / Math.max(1, t - at);
      meter.textContent = fps < 0.5 ? 'still' : `${Math.round(fps)} fps`;
      last = now;
      at = t;
    }, 500);
  }

  // ---------------------------------------------------------------- e2e

  /** Read and drive the game from Playwright. Null outside the e2e build, where this body is dropped. */
  e2eHooks(): E2EHooks | null {
    if (import.meta.env.MODE !== 'e2e') return null;
    return {
      level: () => {
        const p = this.play, cur = this.current;
        if (!p || !cur) return null;
        return {
          id: cur.id, transform: this.transform, w: p.board.w, h: p.board.h, placed: [...p.placed], locked: [...p.locked],
          answer: [...p.solution].filter((c) => !p.board.lantern[c]), canUndo: p.canUndo, seconds: p.seconds, solved: p.solved, remaining: p.remaining,
          notice: this.notice?.kind ?? null, focus: this.focusRing ? this.focusCell : null,
        };
      },
      cellPoint: (cell) => this.board.cellScreenCenter(cell),
      wallet: () => ({ coins: this.wallet.coins, bank: this.wallet.bank }),
      tips: () => [...this.tips],
      audio: () => this.audio.state,
      setStatus: (st) => this.screen.setStatus(st),
      refresh: () => this.refresh(),
      openLevel: (id) => this.show({ id, reason: 'main' }, new Play(this.catalog.board(id), this.catalog.solution(id), this.clock)),
      frames: () => this.board.frameStats(),
      platform: this.platform as TestPlatform,
    };
  }

  /** Animate a firefly between the jar and a tile. False when skipped (reduced motion, no layout). */
  private flight(cell: number, direction: 'out' | 'home', gold: boolean): boolean {
    if (this.reducedMotion()) return false;
    const tile = this.board.cellScreenCenter(cell);
    if (!tile) return false;
    const mouth = this.screen.jarMouth();
    this.screen.openJar();
    if (direction === 'out') fly(this.screen.root, mouth, tile, gold);
    else fly(this.screen.root, tile, mouth, gold);
    return true;
  }

  private refresh(quiet = false, removed: number | null = null, arriving: number | null = null): void {
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
    }, { quiet, removed, arriving, arrivalMs: FLIGHT_MS - 80 });
    const status = ev.solved || !this.notice
      ? boardStatus(ev, play.placements === 0 && play.locked.size === 0, PLAYER_CONFIG.economy.coinsPerSolve, play.remaining)
      : noticeStatus(this.notice, ev);
    this.screen.setStatus(status);
    this.screen.setJar(play.remaining, play.jarSize);
    this.screen.setMoves(play.canUndo, play.placed.size > 0, ev.solved);
    this.screen.setCoins(this.wallet.coins, this.wallet.economy.hintCost, this.wallet.bank);
  }
}
