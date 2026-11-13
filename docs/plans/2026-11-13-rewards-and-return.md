# Rewards, small delights and reasons to return

Status: **proposed** (2026-11-13). Ideas for Michael to pick from; nothing is built.

This plan builds on the project plan's meta layer and monetization sections, which already name
these pieces:
- areas restored chapter by chapter
- a daily puzzle with a streak
- a coin doubler and a streak saver as rewarded ads
- cosmetics as a coin sink
- a sticker collection

This file makes them concrete for this game, adds small interactions, and orders the work.

## Ground rules

These are drawn from the project plan, portal rules and the game's mood.

- **Hints are never required.** Every garden is solvable by deduction (`tests/levels.test.ts`).
- **Every rewarded ad is opt-in**, marked with the video icon, with an equal-size "No thanks". It
  always has a coin path that doesn't need the ad.
- **Ads only at natural pauses.** Midgame ads go on the Next tap, after the first 5 levels, at
  least 180 s apart (`PLAYER_CONFIG`). Never two ads in one break. Never on menu buttons.
- **Cozy, not compulsive.**
  - No lives or energy, no timers that punish, no loot boxes.
  - Nothing that shames a missed day: streaks bend instead of break.
  - Portal audiences include children, so nothing manipulative.
- **Never reveal correctness for free.** A delight must not tell the player whether a move is
  right. That is what hints are for, and leaking it would flatten the difficulty curve. So no
  "correct placement" combos.
- **The economy lives in `PLAYER_CONFIG`.** Any new coin source or sink re-runs the simulated
  players, and the hint-economy ratchet must hold (at most 5% of hint requests refused, 95% clear
  chapter 1).
- **Everything earned is saved**, and validated on load like the rest of the save.

## 1. Reasons to return

| Idea | What it is | Why it works here | Cost |
| --- | --- | --- | --- |
| **Daily garden** | One garden a day, the same for everyone, picked by date from a pack generated a year ahead (project plan, Data). A calendar of past days to fill in | The proven return loop for puzzle games, with no server needed | Medium: daily pack, calendar screen, a map entry |
| **Gentle streak** | Consecutive days of daily gardens. The rules are below | Return habit without dread | Small once the daily exists |
| **Garden journal** | A paper book with a page per chapter. Each solved garden leaves a pressed-flower sketch of its own layout; each chapter adds its seal | Visible, personal progress, and a natural home for collections | Medium: one baked sketch per garden from the level's own mask |
| **The garden comes alive** | The map's areas fill in as chapters finish: roses on the hills, fireflies staying at finished stops (already), new plants per chapter | The project plan's Project Makeover loop, which the map already starts | Grows with Phase 4 areas |
| **Firefly varieties** | Rare firefly colours and patterns, earned at milestones or bought with coins, chosen in settings. The player's fireflies then wear them on every board | A coin sink that isn't hints, and a collection that shows on every board | Medium: baked variants of firefly C, plus a picker |
| **Lantern and jar styles** | Cosmetic styles for the status card's lantern | Cheap to make, seen every move | Small to medium |
| **Welcome-back gift** | The first visit of a day: "The fireflies gathered while you were away" and a few coins, capped, once a day | Lifts day-1 return; costs little | Small (economy re-run) |
| **Mastery marks** | Optional per garden: a "no hints" leaf, shown on the journal page. No timers, no stars to fail | Gives replay value to finished chapters without stress | Small |
| **Field notes (achievements)** | Quiet, discoverable marks. Examples: "Solved a garden without undo", "Ten gardens in one evening", "Found every rose in chapter 1", "Lit a garden after the moon set" | Surprise and curiosity, and a reason to try things | Small each |

**Gentle streak rules.**
- A day counts if you play any garden; the daily is better but not required.
- A missed day uses a **frost leaf**, earned one per week of play, holding up to two. The project
  plan's rewarded "streak saver" is a second way to get one.
- The streak shows as a growing vine in the journal, never as a red broken number.

## 2. Ads that feel like gifts

Each of these is opt-in and has a coin alternative or works without the ad.

| Placement | Moment | Notes |
| --- | --- | --- |
| Hint pack (built) | Hint sheet | 3 hints, or 30 coins each |
| **Chapter bonus doubler** | Chapter card | "Double your chapter coins" with the video icon; the card's main button still continues. Replaces the project plan's "occasional" level-complete doubler: one clear moment beats a frequent nag |
| **Streak saver** | Daily calendar, after a missed day | Once a week, per the project plan |
| **Try a firefly variety** | Journal or variety picker | Wear a locked variety for a day after an ad; buy it with coins to keep it |
| **Welcome-back double** | The daily gift | Optional; never in the same break as a midgame ad |
| Midgame interstitial | The Next tap only | Paced by `PLAYER_CONFIG` and the portal SDK's own cap. The first session is protected |

Portal SDKs offer a "celebration" signal for moments of delight (CrazyGames, for one). Fire it on
the chapter card and the daily solve, through `platform/` only. Check each SDK's exact call in
Phase 3.

**Avoid:** rewarded "continue" or "skip this garden", which would make hints feel required.
**Avoid:** banners. **Avoid:** an ad when entering the map or the journal.

## 3. Small interactions (delight that leaks no answers)

Each needs a reduced-motion version and lives on the board's tween list or in CSS (ratchet).

- **Tap a bush:** it rustles, and its roses bob. On a numbered bush, the dots pulse once (they
  already show the count, so nothing new is revealed).
- **Tap the moon:** a firefly crosses the sky. Five taps in a session: a field note.
- **The moon travels:** across a chapter, the moon moves along the sky, garden by garden. By the
  last garden it nears the hills, and the chapter card is the dawn. Progress you feel without a
  bar, and it needs only the scenery that exists.
- **Idle board, about 20 s:** fireflies blink in their jar, and the hint button glows faintly
  once. A nudge, never a reveal.
- **The last firefly lands:** a beat of silence, then the bloom. The solve should feel like an
  exhale.
- **Coins fly to the pill** from the complete card's chip, and the pill counts up.
- **Named gardens:** each garden gets a short generated name from its layout and chapter ("Moss
  Corner", "The Long Path"), shown on the card and in the journal.
- **Personal best on a retry:** "Faster than last time" on the complete card, never "slower".
- **Haptics on phones** (Phase 5, Capacitor): a light tick on placing, a soft double on a
  conflict, a long gentle buzz on the solve. Off when sound is off? To be decided.
- **Sound:** a chord that resolves as each bush fills, and the solve flourish in the garden's key
  (the sound design pass).

## 4. What to build when

| When | What | Why then |
| --- | --- | --- |
| **Before the friends playtest** | Flow A (tap to continue), the moon's travel, tap the bush or moon, coins flying to the pill | Cheap delight that makes the first session feel finished |
| **With flow B** | Chapter bonus and its rewarded double, seals in a first journal page, the celebration signal | It all lives on the chapter card |
| **Phase 3 (portal launch)** | Daily garden with the gentle streak and frost leaves, the welcome-back gift, field notes | Day-1 return is the gate number portals judge |
| **Phase 4 (grow)** | Firefly varieties and lantern styles (the coin sink), mastery marks, named gardens, the full journal | Needs coins to have something to buy, and the areas to restore |
| **Phase 5 (mobile)** | Haptics, the remove-ads purchase (rewarded stays optional) | Device features |

## 5. Measuring it

The local log (`state/events.ts`) needs these events added to `docs/references/analytics.md`:
- `daily_start` and `daily_end`
- `streak_change`
- `gift_claimed`
- `reward_offer` and `reward_result`, which also cover the doubler and streak saver
- `cosmetic_equip`
- `field_note`

The Phase 4 gate already watches two numbers: day-1 return and session length. Add three more:
- the share of players who take each rewarded offer (healthy: 10 to 30%)
- days played per week
- how often the welcome-back gift is claimed

## Open questions for Michael

1. **Which return loop leads?** I'd lead with the daily garden and streak, then the journal.
2. **Cosmetics:** firefly varieties, lantern styles, or both? Varieties need more art, but every
   board shows them.
3. **Welcome-back gift:** yes or no? It is common on portals, but it slightly cheapens coins.
4. **Haptics:** follow the sound setting, or get a switch of their own?
5. **Garden names:** generated, or written by hand? Hand-written is easy for this build's 30
   gardens (three chapters of 10), but the launch plan's 40 chapters hold about 400.
