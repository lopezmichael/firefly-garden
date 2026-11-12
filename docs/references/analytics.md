# Analytics events

The schema lives in `packages/core/src/events.ts` (`AnalyticsEvent`,
`validateEvent`). Phase 2 logs events locally; Phase 3 sends them to portal
analytics (and, if we outgrow portal dashboards, our own pipeline). Phase 4
uses them to replace the Phase 1 models with measured numbers.

No personal data: a random install id generated on first launch, level ids,
counts and durations. Every event is validated before it is stored or sent.

## Events

| Event | When | Key fields |
| --- | --- | --- |
| `session_start` | App opened or returned to after a break | platform, coins |
| `session_end` | App hidden or closed | seconds |
| `level_start` | A level is shown | level, reason (`main`, `retry`, `warm-up`, `breather-*`), attempt |
| `level_end` | Solved or abandoned | outcome, active seconds, placements, undos, restarts, hints |
| `hint` | A hint is used | source (`coins`, `ad`, `bank`), step (which grader step it revealed) |
| `ad` | An ad finishes or fails | kind (`midgame`, `rewarded`), completed, seconds |
| `coins` | Balance changes | delta, balance, why |

## What each Phase 1 model is refit from

| Model | Assumption today | Measured by |
| --- | --- | --- |
| Time model (`DIFFICULTY_CONFIG.time`) | Seconds per technique tier, search spread | `level_end.seconds` against each level's grader trace |
| Score bands (`searchRange`) | Census spread per tier | Solve-time distribution per tier |
| Stuck and learning rates (`PLAYER_CONFIG`) | 25% stuck on a stretch step, 2 to 3 steps to learn | `hint.step` and quits per technique, before and after a tier's debut |
| Patience and churn | Per player kind | Quits and the last `level_end` before an install goes quiet |
| Breather effect (policy) | Assumed 30% fewer leave after a quit | Return rate after `breather-after-quit` versus quits with no breather served |
| Ad pacing | CrazyGames 3-minute cap, 15 s ads | `ad` events per session |
| Economy | Starting 60 coins, 10 per solve, 30 per hint, 3 per ad | `coins` and `hint.source` |
| Plan targets | Breathers under 5%, peaks 10 to 25% hint use | `level_end.hints` by level role |
