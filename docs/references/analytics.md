# Analytics events

The schema lives in `packages/core/src/events.ts` (`AnalyticsEvent`,
`validateEvent`). Phase 2 logs events locally; Phase 3 sends them to portal
analytics (and, if we outgrow portal dashboards, our own pipeline). Phase 4
uses them to replace the Phase 1 models with measured numbers.

No names, contact details or device data: a random install id generated on
first launch, level ids, counts and durations. Every event is validated before
it is stored or sent, unknown fields are rejected, and the outgoing payload is
built from the schema's fields only.

The install id is still a persistent pseudonymous identifier, which privacy
rules (GDPR, COPPA-style rules for young players) treat as personal data. Before
Phase 3, check each portal's consent and opt-out requirements, and remember a
portal SDK may attach its own user id or IP address on its side.

## Where the Phase 2 log lives

`apps/game/src/state/events.ts`: every event goes through `validateEvent` (with the known level
ids) before it is stored, so a stored event carries only schema fields. The log is a ring buffer
of the last 2,000 events saved through `Platform.save` under the key `events`, read back and
re-validated on start. Settings → Play log shows a summary and copies the log as JSON for
playtesters to send back. Sessions: a new one on each launch and on return after 30 minutes
hidden; `session_end` is logged each time the tab hides with the session's visible seconds so
far, so the last one per session counts. A level resumed after a reload logs no second
`level_start`: its `level_end` keeps the original attempt number and may land in a later session.

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
