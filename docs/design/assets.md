# Assets and licences

The asset plan for the ink and wash look (locked 2026-11-12, see
`docs/plans/2026-11-12-character-exploration.md`), and the licence log for every outside file
used in design work or shipped. The design source is the "Firefly Garden · Character" canvas
(https://claude.ai/artifact/JYTEsJmpHaWKATru6UMvDG): the Round 4 board, Components, Twists, the
four screens and the three play bands.

## Principles

- **Made here, as code, wherever possible.** Every asset below is drawn in this repo: SVG paths
  and procedural textures generated at startup, with the colours read from `theme.css` tokens.
  No asset needs to be sourced. Michael's painting kit (below) is an optional upgrade, not a
  dependency.
- **Behind the existing seams.** Colours and fonts in `apps/game/src/theme.css`; the board's
  palette in `apps/game/src/view/theme.ts`; board sprites and textures in the board's texture
  builders (`apps/game/src/view/board.ts`, split into a `view/art/` module when it lands); chrome
  in `apps/game/src/ui/`. Game logic does not change.
- **One drawing, many uses.** Variations (rose shades, turns, sizes; tile textures per tile size)
  are generated from one source, never stored as separate files.
- **Shape plus colour for every state**, contrast checked on the canvas (numbers and text at
  4.5:1 or better, 3:1 for numbers of 24 px and up and for graphics).

## Tokens (replace look pass 1 in `theme.css`)

Where a row lists two or three values, each becomes its own token (for example `--ff-moss` and
`--ff-moss-lo`, `--ff-glow` and `--ff-glow-soft`), named when the theme change lands.

| Token | Name | Value | Use |
| --- | --- | --- | --- |
| night | Indigo night | `#1c2740` | Background |
| dusk | Dusk card | `#2c3c5f` | Dark tile face (front edge `#121a2c`) |
| dusk-wash | Dusk wash | `#33466c` | Dark tile inner wash |
| moss | Moss wash | `#38653f` / `#2f5636` | Bush (highlight `#6fa765`) |
| moss-plain | Deep moss | `#30583a` / `#2a4c33` | Bush with no number |
| gold | Gold wash | `#f2c45c` | Lit tile wash, filled dots, happy numbers (front edge `#a8792a`, pooled edge `#d9a03c`) |
| glow | Firefly light | `#fff6cf` / `#ffe9a8` | Firefly tail and glow, motes |
| paper | Paper | `#f1e8d4` | Chrome, numbers, empty dots |
| sumi | Sumi (the "ink" in this doc) | `#2a211b` | Ink line and outlines, text on paper |
| seal | Seal red | `#b8432c` | The one filled action, hint halo and seal |
| rose | Rose | `#f2a7bd` (shades `#ea8ca8`, `#f7c4d2`; spiral `#a8324f`) | Happy roses |
| warn | Rose warn | `#f09aa6` | Too many: border, number, extra dot; conflict |
| wilt | Wilt | `#46452a` / `#3f3e26` | Overfull bush |
| ruled | Ruled out | `#b9c6dc` | Brush cross |
| moon | Moonlit | `#e6eefc` / `#a9bcdf`, crescent `#5d6f96` | Moonlit tiles (twist) |
| mint | Mint | `#a8ecd8` / `#86d9bf`, edge `#3f8f76` | Second firefly colour (twist) |
| water | Pond | `#1f3c55`, ripples `#5b86a8`, stones `#8a93a6` / `#7c8599` | Ponds (twist) |
| fungus | Mushroom caps | `#8c4430`, `#a596c9`, `#c0703f`, `#e6a7b5`, `#9aa77a`; stems `#efe4cf` | Mushrooms (twist) |

## Fonts

| Font | Use | Licence | Source | Budget (woff2, latin) |
| --- | --- | --- | --- | --- |
| Young Serif 400 | Titles, bush numbers | SIL OFL 1.1 | `@fontsource/young-serif` | ~30 KB |
| Figtree 400, 600, 700 | Labels, body, buttons | SIL OFL 1.1 | `@fontsource/figtree` | ~3 × 18 KB |

Replaces Fredoka and Nunito. Ship woff2 only (every target browser supports it), which also
drops today's woff fallbacks. Confirm each licence file on install and record it below.

## Asset list

Method: **code** = SVG paths or Pixi graphics written in the repo; **procedural** = generated to a
canvas texture at startup from noise; **painted** = optional scan from Michael's kit.

### Board

| Asset | Method | Notes | Budget |
| --- | --- | --- | --- |
| Paper grain, card fibre, wash wobble, pooled edge | procedural | Value noise (one shared generator, seeded); fibre is the same noise stretched 12:1. Generated per tile size and cached, as the board's textures are today | 0 KB, < 30 ms at startup |
| Dark tile | code + procedural | Card face, front edge, fibre, inner dusk wash | — |
| Lit tile | code + procedural | Paper rim, gold wash, pooled edge, soft warm centre, paper grain; same however it was lit | — |
| Bush, numbered | code | Three-lobe moss shape, ink outline, leaf highlights | ~2 KB |
| Bush, no number | code | Deeper, leafier variant | ~1 KB |
| Wilted bush | code | Slumped olive mound, falling petals, dashed warn border | ~1 KB |
| Rose | code | One drawing; variations by shade (3), turn and size; three per happy bush, picked from board position so a garden always looks the same | ~1 KB |
| Firefly (player) | code | Firefly C: glowing tail with lantern ribs, head, curled antennae, two wings as separate parts for the flap, shadow | ~2 KB |
| Hint marker | code | Gold tail (the `gold` token, deeper than the player's `glow` tail), dashed seal-red halo at body height, small seal with a plus | ~0.5 KB |
| Conflict | code | Rose tail and glow, sumi shiver lines either side, soft rose hatching on the tile; slow sway | ~0.5 KB |
| Ruled-out cross | code | Two pale brush strokes | ~0.2 KB |
| Hint reason outline | code | Dashed gold rounded outline around the cells a hint names | — |
| Solve moment | code | All bushes bloom in a ripple from the last firefly; petals and motes rise | — |

### Scene and chrome

| Asset | Method | Notes | Budget |
| --- | --- | --- | --- |
| Night sky, moon | code + procedural | Flat night with grain; crescent moon with a wobbled edge | ~0.5 KB |
| Hills | code | Two washed ridges (dusk, moss with dot texture), ink ridge line, roses along the ridge, drifting firefly motes; behind the status card in every band | ~2 KB |
| Paper lantern jar | code | Gold paper, warm brown ribs, sumi caps, seal-red tassel; lights inside = fireflies left; empty = dim paper and a shake | ~1 KB |
| Slot row, coin pill, buttons, sheets | CSS | Paper, sumi border, seal red for the one filled action; 44 px targets | — |
| Icons (12) | code (inline SVG) | Undo, reset, hint, settings (rose cog), sound on/off, map, next, close, locked, motion, play log; ink line, 2 px on a 24 px grid | ~4 KB |
| Coin | code | Gold wash disc stamped with the rose spiral | ~0.3 KB |
| Garden map | code | Dotted ink path, chapter stops (glowing, current with dashed ring, dark and locked), fireflies circling finished chapters (heads along their path), the unlock flight | ~4 KB |

### Twists and chapters (Phase 4)

| Asset | Method | Notes | Budget |
| --- | --- | --- | --- |
| Mushroom cluster | code | About eight mushrooms: broad rust cap with gills and frilled ring (number here), lilac cone, bolete, tiny caps behind and in front, moss; happy = gold speckles and spores; too many = all slump. No edge marks: the four side tiles glow on its debut level and in hint reasons | ~4 KB |
| Moonlit tile | code + procedural | Silver-blue wash with a crescent | ~0.5 KB |
| Lantern (fixed) | code | The jar's lantern on a stake | ~0.5 KB (shared) |
| Pond | code | Rounded water shape generated from the pond's mask cells (a smoothed outline that spills into the tile gaps), ink ripples, stepping stones (6 shapes, placed along the shore by seed), lily pads (notch and veins, some with a flower), koi seen from above | ~4 KB |
| Outside the garden | none | No tile: night ground with a few grass tufts | — |
| Mint firefly | code | Firefly C with a diamond tail and mint glow; bush dots match tail shape (round gold, diamond mint) | ~0.5 KB |
| Chapter blooms (8) | code | Rose, apple blossom, bluebells, moonflower, lantern plant, lotus, ivy stars, mixed posy: the happy-bush flower per chapter | ~4 KB |
| Coloured beams | idea | Split wash where two colours cross; needs solver and grader rules first | — |

### Sound (synthesized, WebAudio)

Not designed yet; the audition page comes next. There is no audio in the game today: the sound
setting is saved but nothing plays, so the audio engine and the ad-break mute are new work, with
the portal mute hook inside `apps/game/src/platform/` like every other SDK call. Planned set, all synthesized at runtime
(0 KB of audio files): place (soft glass note), call back (reverse of it), bush blooms (small
chime, pitched by bush), solve (rising four-note flourish), empty jar (paper rustle), hint (two
bells), chapter unlock (wing flutter and chime), optional ambient (crickets and wind, generated
noise). Every sound mutable (the settings toggle and the sound on/off icon drive it); muted during ads.

## Motion (what reduced motion keeps and drops)

| Moment | Full motion | Reduced motion |
| --- | --- | --- |
| Place a firefly | Flies out of the jar to the tile, drops, then bobs (3 px over 2.4 s) with wings flapping about twice a second; shadow breathes | Appears on the tile, still, wings level |
| Light spreads | The wash spreads tile by tile along row and column, then settles | All lit tiles appear at once |
| Bush satisfied | Roses open (mushrooms: spores puff) | Roses shown open |
| Too many | Bush slumps and drops petals | Shown slumped |
| Conflict | Slow uneasy sway | Still; shiver lines and hatching stay |
| Solve | Bloom ripple, petals and motes rise, card slides in | Everything shown open; card appears |
| Ambient | Motes drift over the hills; ripples and koi in ponds | Still |
| Map | Fireflies circle finished chapters; unlock flight along the path | Still; the new stop appears lit |

Every state change stays under reduced motion; only movement goes.

## Michael's painting kit (optional upgrade)

If hand-made textures are wanted over the generated ones, these swap in behind the same
builders without code changes elsewhere:

- **Paper:** one A4 sheet of cold-press watercolour paper, blank, scanned at 600 dpi; we crop a
  1024 px tileable square.
- **Washes:** three swatches about 10 × 10 cm each, gold (lit tile), dusk blue (dark tile), moss
  (bush), laid flat with a little pooling at the edge; scanned at 600 dpi.
- **Ink line:** a page of practice strokes with a brush pen (straight, curved, dots), for an
  optional line texture.
- Export as PNG, sRGB. We convert to WebP and keep each texture under 150 KB (600 KB for all four).

## Bundle budget (Poki limit 8 MB; build is 1.10 MB today)

| Item | Estimate |
| --- | --- |
| Fonts (woff2 only) | ~85 KB, replacing ~145 KB of Fredoka and Nunito (woff2 + woff) |
| Art code (all SVG and procedural) | ~40 KB minified |
| Painted textures (optional kit) | up to 600 KB if all four are used |
| **Net change** | about −20 KB generated only, up to about +580 KB with the kit; well under budget either way |

## Licence log

### Shipped

| Asset | Source | Licence |
| --- | --- | --- |
| Fredoka, Nunito (current, to be replaced) | `@fontsource` | SIL OFL 1.1 |
| Young Serif, Figtree (planned) | `@fontsource` | SIL OFL 1.1 (confirm on install) |

Everything else is drawn in this repo. Ship each font's OFL licence text and copyright notice
with the build (a `licenses/` folder or credits screen), as the OFL requires.

### Reference only (design canvas, never shipped)

On the "Firefly Garden · Character" canvas, fetched 2026-11-12. The Met images are CC0 (Open
Access); the Library of Congress posters carry "no known restrictions on publication". None is
used in the build.

| Board | Work | Source | Licence |
| --- | --- | --- | --- |
| Ink and wash | Kitagawa Utamaro, Tree cricket and firefly, *Picture Book of Crawling Creatures*, 1788 | [The Met 37288](https://www.metmuseum.org/art/collection/search/37288) | Met Open Access, CC0 |
| Ink and wash | Eishōsai Chōki, *Woman and Child Catching Fireflies*, ca. 1795 | [The Met 44993](https://www.metmuseum.org/art/collection/search/44993) | Met Open Access, CC0 |
| Ink and wash | Katsushika Hokusai, *Yellow Chrysanthemums on a Blue Ground*, ca. 1825 | [The Met 55039](https://www.metmuseum.org/art/collection/search/55039) | Met Open Access, CC0 |
| Ink and wash | Kawamata Tsunemasa, *Two Girls Catching Fireflies*, first half of the 18th century | [The Met 45770](https://www.metmuseum.org/art/collection/search/45770) | Met Open Access, CC0 |
| Stand-up diorama | Martin Engelbrecht, *Paper Theater or Diorama of an Italianate Villa and Garden*, ca. 1730–56 | [The Met 651671](https://www.metmuseum.org/art/collection/search/651671) | Met Open Access, CC0 |
| Stand-up diorama | Benjamin Pollock, Scene 5, *Jack and the Giant Killer* toy theatre, 1870–90 | [The Met 683007](https://www.metmuseum.org/art/collection/search/683007) | Met Open Access, CC0 |
| Stand-up diorama | Benjamin Pollock, Scene 7, *Jack and the Giant Killer* toy theatre, 1870–90 | [The Met 683009](https://www.metmuseum.org/art/collection/search/683009) | Met Open Access, CC0 |
| Stand-up diorama | Benjamin Pollock, Characters, Plate 2, *Jack the Giant Killer* toy theatre, 1870–90 | [The Met 682986](https://www.metmuseum.org/art/collection/search/682986) | Met Open Access, CC0 |
| Night print | Utagawa Hiroshige, *Fireworks at Ryōgoku Bridge*, 1858 | [The Met 37093](https://www.metmuseum.org/art/collection/search/37093) | Met Open Access, CC0 |
| Night print | Utagawa Hiroshige, *Nihon Embankment at Yoshiwara*, 1857 | [The Met 56931](https://www.metmuseum.org/art/collection/search/56931) | Met Open Access, CC0 |
| Night print | Utagawa Hiroshige, *Sudden Shower over Shin-Ōhashi Bridge and Atake*, 1857 | [The Met 55433](https://www.metmuseum.org/art/collection/search/55433) | Met Open Access, CC0 |
| Night print | Stencil with Theme from Matsukaze (katagami), Japan, 19th century | [The Met 69299](https://www.metmuseum.org/art/collection/search/69299) | Met Open Access, CC0 |
| Night print | *Zion National Park, Ranger Naturalist Service*, WPA poster, ca. 1939 | [LoC 2007676134](https://www.loc.gov/pictures/item/2007676134/) | Library of Congress: no known restrictions on publication |
| Night print | C. Don Powell, *Grand Canyon National Park*, WPA poster, ca. 1938 | [LoC 2007676131](https://www.loc.gov/pictures/item/2007676131/) | Library of Congress: no known restrictions on publication |

Michael's screenshots of commercial board games (Kanagawa, Arboretum, Photosynthesis, Parks,
Lanterns, Root) and his mushroom reference sheet are private reference on the canvas, for feel
only. Nothing from them is traced or shipped; living artists are linked only.
