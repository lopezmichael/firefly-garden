/**
 * The chapters this build plays, in order: the main path is these chapters of the launch pack.
 * One list for the game, its tests, the hint-economy ratchet and the difficulty report, so the
 * guardrails always check exactly what ships. Pure data with no imports: scripts and root tests
 * read it too.
 *
 * Phase 2 plays the whole Rose Bed (chapters 1 to 5, no twists). The Orchard (c6, shaped gardens)
 * is next, once the board is checked on shaped masks.
 */
export const PLAYED_CHAPTERS: readonly string[] = ['c1', 'c2', 'c3', 'c4', 'c5'];
