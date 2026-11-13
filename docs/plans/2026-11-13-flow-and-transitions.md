# Flow and transitions: the moments between gardens

Status: **proposed** (Michael's direction, 2026-11-13). Nothing here is built yet.

## Why

The ink and wash pass made every garden look finished, but the moments *between* gardens are still
the plumbing from milestone 3:

- A solve auto-advances after 3 s (`AUTO_ADVANCE_MS`, `app.ts`) unless the player taps Garden map.
  The bloom, the coins and the time barely register before the board is gone.
- Finishing a chapter is silent. The last garden's card looks like any other, and Next opens the
  next chapter's first garden. The map's one-time unlock flight (`mapSeen`, ink and wash 7c) only
  plays if the player happens to open the map later.

Michael's direction:

1. Players **tap to go to the next garden**. No auto-advance.
2. **Between chapters**, congratulate the player for finishing the chapter, then **show the
   transition on the garden map** (the flight to the newly opened stop) before the next chapter
   starts.
3. Think about the other interaction moments like these, as a set.

## Principles

- **The player sets the pace.** Nothing leaves the screen on a timer. Every transition waits for
  a tap, Enter or Space.
- **One clear next step.** Each moment has a single primary action (the seal-red button) and at
  most one quiet alternative.
- **The ceremony scales with the milestone.** A garden gets a card. A chapter gets a
  congratulation and the map. An area (the Rose Bed to the next) gets the biggest moment. Breathers
  and detours get the least.
- **Fast to play.** Portals judge time-to-gameplay, so no title screen, no tutorial pages, and no
  modal before the first board.
- **Natural pauses carry the ad breaks.** The tap after a solve is where a portal's midgame break
  belongs (`Platform.gameplayStop` already fires at the solve). It never interrupts a board.
- **Every moment has a reduced-motion path that still lands the state**, an announcement for
  screen readers, a keyboard path, and a sound cue (placeholder voices for now).

## The moments, in a player's order

| # | Moment | Today | Proposed |
| --- | --- | --- | --- |
| 1 | First launch | Straight into garden 1 | Keep. Add the one-line first-garden teaching (phase 2 plan, E) |
| 2 | Returning player | Opens on the map, or resumes a parked board | Keep, plus a quiet "Welcome back" line on the map |
| 3 | Placing, hints, conflicts | Built | The conflict beam and brighter crossings (phase 2 feedback, item 1) |
| 4 | **Garden solved** | Card with a 3 s countdown | **Tap to continue** (A) |
| 5 | **Chapter finished** | Nothing special | **Chapter card, then the map's flight** (B) |
| 6 | New chapter starts | First garden opens cold | A one-line chapter intro on the status card ("New: …") when the chapter brings a new technique |
| 7 | Area finished (Rose Bed done) | n/a (one area in this build) | The biggest moment: the map pans to the next area. Designed with Phase 4 |
| 8 | End of the build | "Every garden is glowing!" status | An ending card on the map: thanks, and "more gardens are on the way" |
| 9 | Leaving mid-garden | Map button parks the board | Keep. The map marks the parked garden so the way back is obvious |
| 10 | Out of coins / hints | Hint sheet offers an ad | Keep. Check the sheet reads well when both options are gone |

## A. Tap to continue (garden solved)

- [ ] Remove the auto-advance and its countdown bar (`ff-complete-bar`, `AUTO_ADVANCE_MS`,
      `screen.countdown`), plus the code that pauses and restarts the countdown for sheets and
      hidden tabs.
- [ ] The card keeps its content (garden, time, hints, the +10 chip). **Next garden** is the
      seal-red primary action and takes focus once the card appears; **Garden map** stays
      secondary.
- [ ] Show the card when the bloom starts, not when it ends, so a player who taps straight away
      isn't kept waiting. The bloom is only decoration.
- [ ] A tap anywhere on the board after the solve does nothing, so a stray tap can't skip
      ahead. Only the card's buttons, Enter and Space continue.
- [ ] The card shows the coins landing in the coin pill as it opens (ink and wash already animates
      the chip). Reduced motion: the total updates in place.
- [ ] Ad pacing: the portal's midgame break, when one is due by `PLAYER_CONFIG` pacing, runs on
      the Next tap. That code belongs in the Phase 3 adapter; here we only make sure the tap is the
      single hand-off point.
- [ ] Analytics: log the wait from solve to tap (`level_end` already exists; add the tap delay)
      so the playtest shows whether people linger or rush.
- [ ] Tests: the e2e solve test taps Next (it no longer waits out the countdown); the motion-css
      and status/complete height ratchets keep passing.

## B. Chapter finished

The flow when the solved garden is the last one of its chapter:

1. **The garden's card**, as in A, but its primary action reads **"Finish the chapter"**.
2. **The chapter card**: a paper card over the dimmed board, much like the complete card.
   - The heading: "Chapter 1 complete".
   - A line about the chapter's garden or technique.
   - Totals: gardens grown, time, hints used.
   - A chapter bonus, if we want one (open question).
   - A small seal, ink stamped, as the chapter's keepsake.
   - Primary action: **"See the garden map"**.
3. **The map**: it opens on the finished stop. The fireflies circle it, then fly along the dotted
   path to the next stop, which opens. This is the existing unlock flight; it now plays on
   arrival instead of whenever the map is next opened. Primary action: **"Start chapter 2"**.
4. **Chapter 2's first garden**, with its chapter intro line (moment 6) on the status card.

- [ ] Detect "this solve finished a chapter" in `state/` (pure, tested). The map already knows
      which chapters are done (`unlockToShow`, `mapSeen`).
- [ ] The chapter card (`ui/chapter.ts`) with its own height budget, focus trap and live-region
      announcement.
- [ ] Route through the map after the card. The unlock flight plays once per chapter, as today:
      `mapSeen` is set when it plays, so a reload never replays it.
- [ ] Reduced motion: no flight. The new stop appears open with a short line ("Chapter 2 is
      open"), and the button works the same.
- [ ] A reload partway through (on the chapter card, or on the map before the flight): the save
      knows the chapter is solved but not yet seen, so the next launch opens the map and plays
      the flight. That is what `mapSeen` already gives us; it just needs a test.
- [ ] Detours: if the policy picks a breather or a retry right after a chapter ends, the chapter
      moment comes first and the detour after it.
- [ ] The last chapter in the build skips the flight and shows the ending card (moment 8).
- [ ] Sound: a short chapter flourish on the card, and a rising cue for the flight
      (placeholders until the sound design pass).
- [ ] e2e: finish chapter 1 through test hooks, then check the card, the map, the flight (one
      flier, once), the new chapter's first board, and that a reload doesn't replay it.

## C. Smaller moments to design alongside

- [ ] First-garden teaching: a single status line, "Tap a tile to send out a firefly". Already
      half there; check it reads as teaching.
- [ ] New-technique intro (moment 6): written per chapter in `scripts/launch-plan.ts` next to
      the chapter's tier, so the wording travels with the levels.
- [ ] "Welcome back" on the map for a returning player, and the parked garden marked on it.
- [ ] The ending card for the last chapter in the build.
- [ ] Settings copy: "drops the drifting, bobbing and sparkles" still names the sparkle burst,
      which the ink and wash bloom replaced.

## Open questions for Michael

1. **Chapter bonus.** Should finishing a chapter pay coins (say +50)? It touches the economy, so
   `PLAYER_CONFIG` and the hint-economy ratchet would need re-running.
2. **The keepsake.** Should the chapter card's seal be collectible, with the map showing one seal
   per finished chapter? A cheap goal, but new art.
3. **Design first?** Mock the chapter card and the map hand-off on the design canvas before
   building (recommended), or build straight in the ink and wash kit?
4. **Order.** A first, then B? A is small and could ship with the friends playtest; B is larger.

## Order of work

1. **A, tap to continue.** Small; ready to build now.
2. **B, chapter finished**, after the design question above is answered.
3. **C**, the smaller moments, alongside B or right after it.

Each step ends with typecheck, tests, build, the e2e suite, screenshots or a clip of the moment,
and the two reviewers.
