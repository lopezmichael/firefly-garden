import type { ColorKey } from '../tokens.ts';

/**
 * How each character on the home screen moves (the art says where it stands: `home.json`). Angles
 * in radians, speeds in radians per second; everything else is a fraction or a multiplier. Pure
 * data: `rig.ts` reads it every frame.
 */
export interface RigMotion {
  /** Offset into every cycle, so no two characters move in step. */
  readonly phase: number;
  readonly headTilt?: number;
  /** An occasional small nod (a sleepy or curious friend). */
  readonly nod?: boolean;
  readonly flapSpeed?: number;
  /** Wings held raised (positive) or drooping (negative). */
  readonly wingUp?: number;
  readonly armL?: number;
  readonly armR?: number;
  readonly armLWiggle?: number;
  readonly armRWiggle?: number;
  readonly armLSpeed?: number;
  readonly armRSpeed?: number;
  /** Where the eyes wander, as unit offsets; they look at one, then another. */
  readonly lookAt?: readonly (readonly [number, number])[];
  /** Swaps in a wide grin now and then. */
  readonly grin?: boolean;
  /** Eyes closed (sleepy) or squeezed shut (happy): no blinking. */
  readonly noBlink?: boolean;
}

export interface CastMember {
  readonly motion: RigMotion;
  /** The colour of its lantern light. */
  readonly glow: ColorKey;
  /** Bob (scene px) and drift for the friends; Pip sits on the arch and only sways. */
  readonly bob: number;
  readonly drift: number;
}

export const CAST: Readonly<Record<string, CastMember>> = {
  // Pip, on the arch, waving hello with the right arm
  pip: {
    motion: { phase: 0.4, headTilt: -0.14, armR: -1.55, armRWiggle: 0.4, armRSpeed: 7, grin: true, lookAt: [[-0.7, 0.2], [-0.4, 0.4], [0.5, -0.2], [-0.8, 0]] },
    glow: 'gold', bob: 4, drift: 0,
  },
  // both arms up, cheering
  gold: {
    motion: { phase: 0, armL: 1.7, armR: -1.7, armLWiggle: 0.25, armRWiggle: 0.25, armLSpeed: 6, armRSpeed: 6, wingUp: 0.2, noBlink: true },
    glow: 'gold', bob: 5, drift: 3,
  },
  // gazing up at the sky
  mint: {
    motion: { phase: 1.3, headTilt: -0.25, nod: true, lookAt: [[-0.8, -0.8], [0.6, -0.6], [0, -0.4]] },
    glow: 'friendMint', bob: 5, drift: 3,
  },
  // looking down the path, curious
  peach: {
    motion: { phase: 2.6, headTilt: 0.3, flapSpeed: 11, lookAt: [[-0.9, 0.4], [-0.6, 0.6], [0.3, 0.5]] },
    glow: 'friendPeach', bob: 5, drift: 3,
  },
  // waving, with a wink and a grin
  sky: {
    motion: { phase: 3.9, armR: -1.6, armRWiggle: 0.4, armRSpeed: 8, grin: true },
    glow: 'friendSky', bob: 5, drift: 3,
  },
  // dozing
  lilac: {
    motion: { phase: 5.2, headTilt: 0.42, wingUp: -0.2, flapSpeed: 6, nod: true, noBlink: true },
    glow: 'friendLilac', bob: 5, drift: 3,
  },
};
