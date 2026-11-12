# Garden map: plan

**Status:** draft; open questions below need Michael's answers before building.
**Written:** 2026-11-12. **Design:** the "Garden map" board on the character canvas
(https://claude.ai/artifact/JYTEsJmpHaWKATru6UMvDG), in the locked ink and wash style, with its
motion note (fireflies circle finished chapters; an unlock flight along the path).
**Depends on:** `docs/plans/2026-11-12-ink-wash-theme.md` (tokens, fonts, firefly, chrome).

## What it is

A screen between gardens: the area's title and progress, the chapters as stops along a dotted
ink path (finished and glowing, current with a dashed ring and a firefly, locked and dark, "more
gardens soon"), and **Continue** back into play. Today the game goes straight from garden to
garden, so the map is a new screen, not a restyle.

## Open questions

1. **How do players reach the map?** Options:
   - A. The level-complete card's **Garden map** button (already designed), plus at the end of
     each chapter automatically
   - B. A. plus a map button in the play screen's top bar. This changes the locked screen
     structure, so it needs a yes and a place (beside the coins is the natural spot)
   - Recommendation: A first; B if playtesters look for it.
2. **What does the area counter count?** The design shows "The Rose Bed, 15 of 30" with "Each
   garden you light brings more roses back". Options: gardens solved in the area, or a rose
   count that grows with each solve (one rose per garden, more for no-hint solves). It needs to
   be a number players can read without explanation. Recommendation: gardens solved in the area.
3. **Does the map show areas beyond the current one?** The design shows the current area's
   chapters plus "More gardens soon". The launch pack has eight areas; scrolling a longer path
   is natural on phones but more work.
4. **When does the unlock flight play?** Once, the first time the map opens after a chapter's
   last garden is solved. Confirm that's the moment.
5. **Can players replay an earlier chapter from the map?** The level policy picks the next
   garden today. Replay would need a rule for coins and progress on replays.

## Work, once answered

- [ ] Progress model: per-chapter solved counts and the area counter, derived from the existing
      save (`state/save.ts`, `state/session.ts`), unit tested in `apps/game/test/`
- [ ] Map screen in `ui/`: title card, path, stops, Continue (and replay if decided); the path
      and stops drawn as code in the ink and wash style
- [ ] Navigation: map ↔ play, keeping the auto-advance and hidden-tab rules; save stays valid
- [ ] Motion: circling fireflies with heads along their path; the unlock flight; both still under
      reduced motion (the new stop simply appears lit)
- [ ] Analytics events for map opens and Continue, through the existing event log
- [ ] Level-complete card shows its Garden map button
- [ ] Evidence: screenshots in all three bands, clips of an unlock, tests for the progress model
- [ ] Living docs: CHANGELOG, ARCHITECTURE (the new screen), ROADMAP
