// Shared timing and math helpers. Every animation is a pure function of the frame number,
// so any frame can be rendered on its own (Remotion renders frames in parallel).

export const FPS = 30;

export const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
export const smooth = (v: number) => {
  const x = clamp(v);
  return x * x * (3 - 2 * x);
};
export const easeInOut = (v: number) => {
  const x = clamp(v);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Progress 0..1 of a phase between start and end seconds, eased. */
export const phase = (sec: number, start: number, end: number, ease = smooth) =>
  ease((sec - start) / Math.max(0.0001, end - start));

/** Rises 0->1 between a and b, holds, falls 1->0 between c and d (seconds). */
export const window4 = (sec: number, a: number, b: number, c: number, d: number) =>
  Math.min(phase(sec, a, b), 1 - phase(sec, c, d));

/** Deterministic pseudo-random generator (mulberry32). */
export const rng = (seed: number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export type V3 = [number, number, number];
export const lerp3 = (a: V3, b: V3, t: number): V3 => [mix(a[0], b[0], t), mix(a[1], b[1], t), mix(a[2], b[2], t)];

/** Palette shared by all EP02 mechanism scenes (deep "microscope" stage). */
export const C = {
  bg: '#0d1b2a',
  bgFog: '#10243a',
  membrane: '#9fd3d8',
  cyto: '#16324a',
  nucleus: '#7fa7c9',
  nucleolus: '#c9a46b',
  chromatin: '#e8d6b0',
  mito: '#d07a4f',
  mitoDark: '#7a4a3a',
  crista: '#f2a65a',
  lyso: '#9cc76a',
  er: '#7fb7b0',
  protein: '#5fc4c0',
  misfold: '#b0704d',
  ubiquitin: '#f2d16b',
  barrel: '#8e9fb5',
  damage: '#d9534f',
  repair: '#4fd1c5',
  ros: '#ff5a4f',
  good: '#7ed99a',
  energy: '#ffc46b',
  bone: '#e9e1d0',
  muscle: '#9c4a3c',
  highlight: '#ff9a5a',
};
