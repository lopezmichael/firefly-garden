import manifest from '../../assets/home/home.json';

/**
 * The home screen's baked art (`npm run art:home`, from the painter in art/home/): the still
 * plate, an atlas of every moving part of Pip and the friends, and this manifest saying where each
 * part sits. All coordinates are scene pixels in the 390 × 844 scene; atlas rects are device
 * pixels of the atlas image (`atlas.scale` per scene pixel). Built by us and bundled, not input.
 */

export type Rect4 = readonly [x: number, y: number, w: number, h: number];

/** The parts a lantern-bug is cut into, back to front within their groups. */
export const RIG_PARTS = [
  'wingL', 'wingR', 'armL', 'armR', 'lantern', 'tassel', 'garlandBack',
  'antL', 'antR', 'head', 'eyes', 'pupils', 'mouth', 'grin', 'garlandFront',
] as const;
export type RigPart = (typeof RIG_PARTS)[number];

/** The joints a rig turns on. */
export const RIG_PIVOTS = ['wingL', 'wingR', 'body', 'armL', 'armR', 'tassel', 'neck', 'antL', 'antR', 'eyes'] as const;
export type RigPivot = (typeof RIG_PIVOTS)[number];

export interface PartArt {
  /** Where the part is in the atlas. */
  readonly rect: Rect4;
  /** Its top-left corner, relative to the character's centre. */
  readonly dx: number;
  readonly dy: number;
}

export interface CastArt {
  readonly id: string;
  /** The character's centre in the scene, and its size unit. */
  readonly x: number;
  readonly y: number;
  readonly u: number;
  readonly pivots: Readonly<Record<RigPivot, readonly [number, number]>>;
  /** A friend has no garland, so those parts are missing. */
  readonly parts: Readonly<Partial<Record<RigPart, PartArt>>>;
}

export interface HomeArt {
  readonly scene: { readonly w: number; readonly h: number; readonly scale: number };
  readonly lantern: { readonly x: number; readonly y: number };
  readonly atlas: { readonly w: number; readonly h: number; readonly scale: number };
  readonly cast: readonly CastArt[];
  readonly fx: { readonly petal: Rect4; readonly heart: Rect4 };
}

export const HOME_ART = manifest as unknown as HomeArt;
