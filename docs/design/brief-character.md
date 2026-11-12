# Design brief: give Firefly Garden its character

**Owner:** Michael. **Written:** 2026-11-12, at the end of Phase 2 milestone 2 and the jar work.
**Purpose:** a focused design exploration that moves the look from "competent, code-drawn,
AI-influenced" to something with a point of view, without disturbing the structure and
behaviour that already work. Read this first, then the files it points to.

## What the game is

A cozy logic puzzle for web portals (Poki, CrazyGames), then iOS and Android. Light Up (Akari)
with our own rule: tap a tile to send a firefly from a jar; it lights its row and column until a
bush stops the light; two fireflies may not see each other; a numbered bush wants exactly that
many fireflies in the 8 tiles around it. Each chapter restores one area of a night garden (the
Rose Bed, the Orchard, the Koi Pond...). Short levels, auto-advance, no timers, no punishment.

Art direction from the project plan (`Firefly Garden Project Plan.md`, "Art direction and feel"):
*a glowy storybook diorama: a painted, tactile little garden at night where the light is the most
vivid thing on screen. Nothing flat.* 2.5D raised tiles, watercolor surfaces, dusky palette with
warm gold light, a full juice list (fireflies drop and bob, light ripples, motes drift, flowers
bloom on solve). The plan always intended "placeholder shapes now, painted art later"; this brief
brings the painted direction forward so the friends playtest sees something with character.

## Where things stand

- **Build:** plays end to end in the browser (chapters 1 to 3, saves, hints, the firefly jar).
  Run `npm install` then `npm run dev`. Screens: play (tall phone, square iPhone Duo/tablet, wide
  landscape/desktop), hint sheet, settings with play log. Not built yet: garden map, level
  complete (they exist on the design canvas).
- **Design canvas (claude.ai artifact):** https://claude.ai/artifact/4qpwUFQiM1daNKeHPWkuf7 —
  every screen and state, the firefly jar storyboard and options. Source copies in
  `docs/design/phase-2/project/`; read `docs/design/phase-2/README.md` for what is locked.
- **Look today:** "look pass 1" (teal and plum night, glow only on the board, outlined Hint,
  sentence-case labels, a firefly mark instead of a stock sparkle). Tokens in
  `apps/game/src/theme.css`; the board is drawn in PixiJS (`apps/game/src/view/board.ts`) from those
  tokens; chrome is DOM and CSS (`apps/game/src/ui/`).

## Locked (do not change without Michael)

Structure and behaviour, from `docs/design/phase-2/README.md`:

- What each screen holds and where: top bar, board, status card (with the jar), controls; the
  tall / square / wide layout bands
- Every tile and bush state; hint fireflies differ by shape (ring plus a second mark), not only
  colour; conflicts, over-full bushes, ruled-out marks, reason outlines
- The hint flow (sheet, locked gold firefly), the screen flow (map → play → complete → next)
- **The firefly jar:** a jar plus one slot per firefly in the status card; it caps placements; a
  firefly flies out of the jar to the tile and home when called back; hints send a gold one
- Reduced motion keeps every state change and drops decoration; 44 px minimum tap targets;
  text contrast at least 4.5:1

## Open (this exploration owns it)

Everything about the look: palette, type, textures and surfaces, how tiles, bushes, fireflies,
the jar, the moon and sky are drawn, the chrome (panels, buttons, sheets), the garden around the
board (hedges, paths, pond edges, depth), motion style and timing, sound direction, copy voice.

## What two design critiques said (both used as rubrics)

Impeccable and Taste Skill critiques of the real build (2026-11-12), condensed:

- Primitives, not illustration: rounded rectangles, radial gradients and soft glows are the default
  vocabulary of generated UI; nothing looks drawn by a hand
- No material: no paper, grain, brush edge or texture, though the brief says watercolor
- App chrome around a game: panels, pills and outlined buttons are dark-mode app UI wrapped around
  the board, instead of the garden being the interface
- Safe type: Fredoka and Nunito are friendly and very common; one distinctive display face would
  carry a lot of character
- Empty sky above and below the board on tall phones; the garden is a grid on a tray, not a place
- What works and should survive: the raised tiles with a front edge, warm lit tiles against a
  dark garden, bush dots that fill, the firefly's face, the status card that teaches by reacting,
  the plain hint reasons

## Directions to explore (all three, then Michael picks or blends)

Each direction keeps the locked structure. Make each one concrete enough to judge on a phone.

1. **Watercolor storybook.** Paper grain, wet-edge washes, soft ink linework, hand-lettered or
   bookish display type. The plan's original intent. Risk: muddy at small sizes; keep the lit
   tiles crisp.
2. **Papercraft diorama.** Layered cut paper and card, real cast shadows, slightly irregular edges,
   a lit-from-inside lantern feel. Strong 2.5D for free. Risk: busy; needs restraint.
3. **Lantern-lit woodcut / linocut.** Bold carved shapes, limited palette (ink, paper, one or two
   inks plus gold light), visible gouge texture. The most distinctive. Risk: can feel heavy; the
   light must still glow.

## Deliverables, in order

1. **References first.** A moodboard per direction (images with sources) gathered from the places
   listed below. Michael will add his own; ask him early.
2. **Style tiles** on a new design canvas: per direction, palette with names, type pairing, a tile
   (dark and lit), a bush (wanting, happy, too many), a player firefly and a hint firefly, the jar
   with its slots, one button and one sheet, and one full tall-phone play screen.
3. **Michael picks** a direction or a blend.
4. **Full screen set** in the chosen direction: play (all three bands), hint sheet, level complete,
   garden map, settings, plus the state sheet (every tile, bush and firefly state).
5. **Asset plan:** a list of every asset with how it will be made (code / generated procedurally /
   drawn / sourced), its source and licence if sourced, and its size budget. Write it to
   `docs/design/assets.md`.
6. **Implementation as a theme change:** new tokens, textures and sprites behind the existing
   seams (`theme.css`, `view/theme.ts`, the board's texture builders). Little or no game logic
   should change. Keep the ratchets green (no colour literals outside `theme.css`).

## Asset strategy

Make as much as we can ourselves; source the rest only under licences that allow commercial use
in a game, and record every source.

- **We can make (code, in this repo):** shapes, gradients, procedural textures (noise-based paper
  grain, watercolor blooms, woodcut gouge patterns generated to canvas at startup), SVG sprites,
  motion, synthesized sound. Cheap on the bundle and fully ours.
- **Michael can make:** watercolor swatches painted and scanned, or brushwork in Procreate or Krita
  (the plan's pipeline). Small set: paper texture, 2 to 3 wash textures, firefly poses, bush
  variants, flowers, jar.
- **Source:** CC0 or commercial-use textures, fonts and sound effects (links below). Never use art,
  sprites or UI taken from the reference games; references are for feel only.
- **Commission later:** the plan reserves a watercolor artist for a polish pass once the game earns.

Constraints: the whole build must stay under 8 MB (Poki); it is about 1.1 MB today, so there is
room for textures, but prefer generated or small tiled textures. Everything ships in the build
(offline, no CDN; the content security policy blocks outside origins). Fonts must be self-hosted
(OFL or similar). 60 fps on a mid-range phone and a 4 GB Chromebook.

## Where to find references

Game and UI references (feel, not copying):

- Game UI Database — https://www.gameuidatabase.com (screens from hundreds of games, searchable)
- Interface In Game — https://interfaceingame.com
- Are.na — https://www.are.na (moodboards; good for collecting with sources)
- Cosmos — https://www.cosmos.so (visual moodboards)
- Pinterest — https://www.pinterest.com
- Dribbble — https://dribbble.com and Behance — https://www.behance.net
- ArtStation — https://www.artstation.com (concept art; search "cozy game", "diorama", "papercraft")

Games worth looking at for each direction (play or watch, study the feel):

- Watercolor storybook: Alba: A Wildlife Adventure, Old Man's Journey, Florence, Botany Manor,
  Cozy Grove, Gris, Spiritfarer
- Papercraft diorama: Tearaway, Paper Mario: The Origami King, Kirby's Epic Yarn, Lumino City,
  Monument Valley (for the diorama framing)
- Woodcut / linocut: Okami, Inkle's games (80 Days, Heaven's Vault), Pentiment, The Banner Saga
- Cozy puzzle benchmarks: Meowdoku (the plan's tactile benchmark), A Short Hike, Unpacking,
  Islanders, Townscaper

Picture books and illustration (much of it public domain, so usable as reference and sometimes
as source):

- The Public Domain Review — https://publicdomainreview.org
- Old Book Illustrations — https://www.oldbookillustrations.com
- Biodiversity Heritage Library — https://www.biodiversitylibrary.org (botanical plates: bushes,
  flowers, fireflies)
- Smithsonian Open Access — https://www.si.edu/openaccess
- The Met Open Access — https://www.metmuseum.org/art/collection (filter "Open Access")
- Rijksmuseum — https://www.rijksmuseum.nl/en/rijksstudio (Japanese woodblock prints for direction 3)
- Library of Congress — https://www.loc.gov/free-to-use
- Artists to look up: Arthur Rackham, Kay Nielsen, Beatrix Potter, Edmund Dulac (public domain
  watercolor and ink); Hiroshige and Hokusai (woodblock); Jon Klassen, Shaun Tan, Isabelle Arsenault
  (contemporary, reference only)

## Where to find assets (check each licence; record it in `docs/design/assets.md`)

- Textures: ambientCG (CC0) — https://ambientcg.com ; Poly Haven (CC0) — https://polyhaven.com/textures
- Game assets: Kenney (CC0) — https://kenney.nl/assets ; OpenGameArt (mixed licences) —
  https://opengameart.org ; itch.io assets (free and paid, licences vary) — https://itch.io/game-assets
- Icons: game-icons.net (CC BY 3.0, needs credit) — https://game-icons.net
- Fonts: Google Fonts (OFL) — https://fonts.google.com ; Fontshare (free for commercial use) —
  https://www.fontshare.com ; Velvetyne (OFL) — https://velvetyne.fr ; The League of Moveable Type —
  https://www.theleagueofmoveabletype.com
- Sound: Freesound (per-sound CC licences) — https://freesound.org ; Sonniss GDC audio bundles
  (royalty-free) — https://sonniss.com/gameaudiogdc ; Kenney audio (CC0)
- Painting tools: Krita (free) — https://krita.org ; Procreate (iPad) — https://procreate.com

## Rules for the exploration

- Start with references and ask Michael for his; never invent "the brand" without them.
- Keep the locked structure; if a direction genuinely needs a structural change, propose it with
  a reason and wait for sign-off.
- Show work on the design canvas early and often; the build follows the chosen direction.
- Every sourced asset has a recorded source and licence that allows commercial use in a game.
- Accessibility does not regress: contrast, 44 px targets, reduced motion, shape plus colour for
  every state.
