import { PLAYER_CONFIG } from '@firefly/core';
import type { NextLevel, Transform } from '@firefly/core';
import type { Platform } from '../platform/index.ts';
import type { Catalog } from '../state/catalog.ts';
import { Play } from '../state/play.ts';
import type { ShownHint } from '../state/play.ts';
import { Session } from '../state/session.ts';
import { boardStatus, litPercent, noticeStatus } from '../state/status.ts';
import type { Notice } from '../state/status.ts';
import { Wallet } from '../state/wallet.ts';
import { BoardView } from '../view/board.ts';
import { bandFor, keepOrTurn, orientFor } from '../view/layout.ts';
import type { Palette } from '../view/theme.ts';
import { PlayScreen } from './screen.ts';

/**
 * The game controller: picks the next level with the policy, runs a play,
 * pays for hints, credits solves and auto-advances. Milestone 1 keeps progress
 * in memory; saves and analytics arrive in milestone 2.
 */

/** Seconds the solved board stays up before the next garden opens by itself. */
const AUTO_ADVANCE_MS = 3000;

export class GameApp {
  private readonly screen: PlayScreen;
  private board!: BoardView;
  private readonly session: Session;
  private readonly wallet: Wallet;
  private play: Play | null = null;
  private current: NextLevel | null = null;
  private transform: Transform = 'identity';
  private notice: Notice | null = null;
  private advanceTimer: ReturnType<typeof setTimeout> | null = null;
  /** Auto-advance waits for the tab to be visible, so a hidden tab never starts a level's clock. */
  private advancePending = false;
  private readonly clock = { now: () => performance.now() };
  private readonly reducedQuery = window.matchMedia('(prefers-reduced-motion: reduce)');

  constructor(
    private readonly host: HTMLElement,
    private readonly catalog: Catalog,
    private readonly platform: Platform,
    private readonly palette: Palette,
  ) {
    this.session = new Session(catalog);
    this.wallet = new Wallet(null);
    this.screen = new PlayScreen({
      undo: () => this.move(() => this.play?.undo()),
      reset: () => this.move(() => {
        if (this.play?.placed.size) {
          this.play.reset();
          this.notice = { kind: 'reset' };
        }
      }),
      hint: () => this.hint(),
      next: () => this.advance(),
    });
  }

  async start(): Promise<void> {
    this.host.replaceChildren(this.screen.root);
    this.updateBand();
    const reduced = this.reducedQuery.matches;
    this.screen.setReducedMotion(reduced);
    this.board = await BoardView.create(this.screen.boardHost, {
      palette: this.palette,
      reducedMotion: reduced,
      onTap: (cell) => this.tap(cell),
    });
    this.reducedQuery.addEventListener('change', (e) => {
      this.board.setReducedMotion(e.matches);
      this.screen.setReducedMotion(e.matches);
    });
    new ResizeObserver(() => this.layout()).observe(this.screen.boardHost);
    window.addEventListener('resize', () => this.updateBand());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.play?.pause();
        if (this.advanceTimer !== null) {
          clearTimeout(this.advanceTimer);
          this.advanceTimer = null;
          this.advancePending = true;
        }
      } else {
        if (this.play && !this.play.solved) this.play.resume();
        if (this.advancePending) this.scheduleAdvance();
      }
    });
    this.advance();
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
    this.startLevel(next);
  }

  private startLevel(next: NextLevel): void {
    this.current = next;
    const board = this.catalog.board(next.id);
    this.play = new Play(board, this.catalog.solution(next.id), this.clock);
    this.notice = null;
    const { clientWidth: w, clientHeight: h } = this.screen.boardHost;
    this.transform = orientFor(board.w, board.h, w, h);
    this.board.setLevel(board, this.transform);
    this.board.resize(w, h);

    const place = this.catalog.place(next.id);
    const chapter = place?.chapter ?? this.chapterForProgress();
    const dots = chapter.levels.map((id, i): 'done' | 'now' | 'todo' =>
      place && i === place.index ? 'now' : this.session.isSolved(id) ? 'done' : 'todo');
    const label = place
      ? `${chapter.title.replace(/\s+\d+$/, '')} · Garden ${place.index + 1} of ${chapter.levels.length}`
      : 'Bonus garden';
    this.screen.setChapter(label, `The ${chapter.area}`, dots);
    this.refresh(true);
    if (!document.hidden) this.play.resume();
    this.platform.gameplayStart();
  }

  /** For a detour level: the chapter of the next main-path level, for the progress dots. */
  private chapterForProgress() {
    const nextMain = this.catalog.mainPath.find((id) => !this.session.isSolved(id));
    return (nextMain && this.catalog.place(nextMain)?.chapter) || this.catalog.chapters[this.catalog.chapters.length - 1]!;
  }

  private tap(cell: number): void {
    const play = this.play;
    if (!play || play.solved) return;
    const r = play.tap(cell);
    if (r === 'blocked') return;
    this.notice = r === 'locked' ? { kind: 'locked' } : null;
    this.refresh();
    if (r === 'placed') this.platform.haptic?.('light');
    if (play.solved) this.solved();
  }

  private move(fn: () => void): void {
    const play = this.play;
    if (!play || play.solved) return;
    this.notice = null;
    play.dismissHint();
    fn();
    this.refresh();
    // An undo can land on a solved board (a hint rewrote the history): credit it like any solve.
    if (play.solved) this.solved();
  }

  private hint(): void {
    const play = this.play;
    if (!play || play.solved || play.peekHint().kind === 'none') return;
    // Milestone 1 pays straight from the bank or coins; the hint sheet arrives in milestone 2.
    const source = this.wallet.payForHint();
    if (!source) {
      this.notice = { kind: 'no-coins', coinsPerSolve: this.wallet.economy.coinsPerSolve };
      this.refresh();
      return;
    }
    const h = play.applyHint();
    if (h.kind === 'none') return;
    this.notice = { kind: 'hint', hint: h };
    this.refresh(false, h.kind === 'remove' ? h.cell : null);
    if (play.solved) this.solved();
  }

  private solved(): void {
    const play = this.play!;
    play.pause();
    this.platform.gameplayStop();
    this.platform.haptic?.('success');
    this.wallet.creditSolve();
    this.session.record({
      levelId: this.current!.id, reason: this.current!.reason, solved: true,
      seconds: play.seconds, hints: play.hints, endedAt: Date.now(),
    });
    this.refresh();
    this.screen.announce('Solved! The garden is glowing.');
    this.screen.focusNext();
    this.scheduleAdvance();
  }

  private finished(): void {
    this.play = null;
    this.screen.setStatus({ title: 'The Rose Bed is glowing!', sub: 'You lit every garden in this build. More gardens are on the way.', tone: 'solved' }, 100, false);
    this.screen.setMoves(false, false, true);
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
      : noticeStatus(this.notice);
    this.screen.setStatus(status, litPercent(ev, play.board.needsLight.length), ev.solved);
    this.screen.setMoves(play.canUndo, play.placed.size > 0, ev.solved);
    this.screen.setCoins(this.wallet.coins, this.wallet.economy.hintCost, this.wallet.bank);
  }
}
