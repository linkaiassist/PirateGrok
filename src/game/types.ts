export type Mode = "start" | "play" | "pause" | "clue" | "dead" | "won";

export type AttackKind = "quick" | "heavy";

export type LookStep = "low" | "med" | "high";

/** Radians per pixel of finger travel. Medium turns about 180° in one long thumb drag. */
export const LOOK_RAD: Record<LookStep, number> = {
  low: 0.008,
  med: 0.0155,
  high: 0.024,
};

export function parseLook(value: string | null): LookStep | null {
  if (value === "low" || value === "med" || value === "high") return value;
  return null;
}

export function loadLook(): { h: LookStep; v: LookStep } {
  let h: LookStep = "med";
  let v: LookStep = "med";
  try {
    const savedH = parseLook(localStorage.getItem("ashwake-look-h"));
    const savedV = parseLook(localStorage.getItem("ashwake-look-v"));
    if (savedH) h = savedH;
    if (savedV) v = savedV;
    if (!savedH && !savedV) {
      const old = Number(localStorage.getItem("ashwake-sens"));
      if (Number.isFinite(old)) {
        const step: LookStep = old < 0.75 ? "low" : old > 1.35 ? "high" : "med";
        h = step;
        v = step;
      }
    }
  } catch {
    /* ignore */
  }
  return { h, v };
}

export type Bridge = {
  lookH: LookStep;
  lookV: LookStep;
  joyX: number;
  joyY: number;
  lookDx: number;
  lookDy: number;
  blocking: boolean;
  queueAttack: AttackKind | null;
  queueInteract: boolean;
  start: boolean;
  pause: boolean;
  resume: boolean;
  restart: boolean;
  dismissClue: boolean;
};

export type Snapshot = {
  mode: Mode;
  ready: boolean;
  hp: number;
  hpMax: number;
  objective: string;
  prompt: string | null;
  toast: string | null;
  hasKey: boolean;
  tide: number;
  enemyNear: boolean;
  blocking: boolean;
};

export function createBridge(): Bridge {
  const look = loadLook();
  return {
    lookH: look.h,
    lookV: look.v,
    joyX: 0,
    joyY: 0,
    lookDx: 0,
    lookDy: 0,
    blocking: false,
    queueAttack: null,
    queueInteract: false,
    start: false,
    pause: false,
    resume: false,
    restart: false,
    dismissClue: false,
  };
}
