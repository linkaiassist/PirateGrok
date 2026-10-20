export const CELL = 2;
export const HEIGHT = 2.72;
export const MAP_W = 24;
export const MAP_H = 22;

export type BlockerId = "vaultMain" | "vaultSide" | "returnLoop";

export type Blocker = {
  id: BlockerId;
  cells: [number, number][];
  open: boolean;
};

export type FloorKind = "wood" | "stone" | "chapel" | "vault";

const SECRET_PLUG: [number, number][] = [
  [3, 14],
  [3, 15],
];

const SECRET_ROOM: [number, number][] = [
  [1, 14],
  [2, 14],
  [1, 15],
  [2, 15],
];

export const SECRET_CELLS: [number, number][] = [...SECRET_PLUG, ...SECRET_ROOM];

export function createLevel(): { grid: string[][]; blockers: Blocker[] } {
  const grid: string[][] = [];
  for (let r = 0; r < MAP_H; r++) {
    grid.push(Array.from({ length: MAP_W }, () => "#"));
  }
  const carve = (c0: number, r0: number, c1: number, r1: number) => {
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) grid[r][c] = ".";
    }
  };

  carve(1, 1, 13, 4);
  carve(15, 1, 22, 4);
  carve(14, 2, 14, 3);
  carve(1, 6, 12, 12);
  carve(4, 13, 5, 16);
  carve(1, 17, 9, 20);
  carve(15, 7, 22, 14);
  carve(13, 9, 14, 10);
  carve(16, 6, 21, 6);
  carve(6, 15, 9, 16);
  carve(11, 15, 15, 16);

  grid[17]![3] = "#";
  grid[18]![3] = "#";

  for (const [c, r] of SECRET_PLUG) grid[r][c] = "S";

  const blockers: Blocker[] = [
    {
      id: "vaultMain",
      cells: [
        [5, 5],
        [6, 5],
      ],
      open: false,
    },
    { id: "vaultSide", cells: [[18, 5]], open: false },
    {
      id: "returnLoop",
      cells: [
        [10, 15],
        [10, 16],
      ],
      open: false,
    },
  ];
  for (const blocker of blockers) {
    for (const [c, r] of blocker.cells) grid[r][c] = ".";
  }
  return { grid, blockers };
}

export function floorKind(col: number, row: number): FloorKind {
  if (row <= 4) return "vault";
  if (col >= 15 && row >= 6) return "chapel";
  if (col >= 11 && row >= 15) return "chapel";
  if (row >= 17) return "wood";
  if (col <= 9 && row >= 13 && row <= 16) return "wood";
  return "stone";
}

export function cellBlocks(grid: string[][], blockers: Blocker[], col: number, row: number): boolean {
  if (row < 0 || col < 0 || row >= MAP_H || col >= MAP_W) return true;
  const ch = grid[row][col];
  if (ch === "#" || ch === "S") return true;
  for (const blocker of blockers) {
    if (blocker.open) continue;
    for (const [c, r] of blocker.cells) {
      if (c === col && r === row) return true;
    }
  }
  return false;
}

export function cellCenter(col: number, row: number): { x: number; z: number } {
  return { x: (col + 0.5) * CELL, z: (row + 0.5) * CELL };
}

export const SPAWN = { x: 5.5 * CELL, z: 19.5 * CELL, yaw: 0 };

export const CUTLASS_SPAWN = cellCenter(8, 10);
export const FLINTLOCK_SPAWN = cellCenter(10, 7);

export const CRATES: { x: number; z: number }[] = [
  [2, 8],
  [3, 8],
  [2, 9],
  [3, 10],
  [5, 11],
  [6, 11],
].map(([c, r]) => cellCenter(c, r));

export const PILLARS: { x: number; z: number }[] = [
  [10, 8],
  [11, 10],
].map(([c, r]) => cellCenter(c, r));

export const TORCHES: { x: number; z: number }[] = [
  [2, 18],
  [5, 13],
  [3, 7],
  [11, 9],
  [18, 10],
  [17, 6],
  [8, 2],
].map(([c, r]) => cellCenter(c, r));

export const PEDESTALS: { id: "flood" | "ebb" | "slack"; x: number; z: number }[] = [
  { id: "ebb", ...cellCenter(17, 9) },
  { id: "flood", ...cellCenter(20, 11) },
  { id: "slack", ...cellCenter(18, 13) },
];

export const PLAQUE = cellCenter(1, 18);
export const SAILOR = cellCenter(2, 17);
export const SEAM = { x: 4 * CELL, z: 15 * CELL };
export const FLASK = { x: 2 * CELL, z: 15 * CELL };
export const CHART = cellCenter(10, 2);
export const EXIT = cellCenter(3, 1);
export const ANCHOR = cellCenter(8, 19);

export const TIDE_ORDER = ["flood", "ebb", "slack"] as const;

export function inHold(x: number, z: number): boolean {
  const c = Math.floor(x / CELL);
  const r = Math.floor(z / CELL);
  return c >= 1 && c <= 12 && r >= 6 && r <= 12;
}

export function holdAllows(x: number, z: number): boolean {
  return inHold(x, z);
}

export function inChapel(x: number, z: number): boolean {
  const c = Math.floor(x / CELL);
  const r = Math.floor(z / CELL);
  return c >= 15 && r >= 7 && r <= 14;
}

function bfs(solid: (c: number, r: number) => boolean, startCol: number, startRow: number): Set<string> {
  const seen = new Set<string>();
  const q: [number, number][] = [[startCol, startRow]];
  seen.add(`${startCol},${startRow}`);
  while (q.length) {
    const [c, r] = q.pop()!;
    for (const [dc, dr] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const nc = c + dc;
      const nr = r + dr;
      const key = `${nc},${nr}`;
      if (seen.has(key) || solid(nc, nr)) continue;
      seen.add(key);
      q.push([nc, nr]);
    }
  }
  return seen;
}

export function assertLevel(): void {
  const { grid, blockers } = createLevel();
  const solid = (c: number, r: number) => cellBlocks(grid, blockers, c, r);
  const spawn = { c: Math.floor(SPAWN.x / CELL), r: Math.floor(SPAWN.z / CELL) };
  if (solid(spawn.c, spawn.r)) throw new Error("Player spawn is inside a wall");
  const chart = { c: Math.floor(CHART.x / CELL), r: Math.floor(CHART.z / CELL) };
  const closed = bfs(solid, spawn.c, spawn.r);
  if (closed.has(`${chart.c},${chart.r}`)) throw new Error("Chart is reachable with every gate shut");

  const openMain = blockers.map((b) => ({ ...b, open: b.id === "vaultMain" }));
  const viaKey = bfs((c, r) => cellBlocks(grid, openMain, c, r), spawn.c, spawn.r);
  if (!viaKey.has(`${chart.c},${chart.r}`)) throw new Error("Key door does not reach the chart");

  const openPuzzle = blockers.map((b) => ({
    ...b,
    open: b.id === "vaultSide" || b.id === "returnLoop",
  }));
  const viaPuzzle = bfs((c, r) => cellBlocks(grid, openPuzzle, c, r), spawn.c, spawn.r);
  if (!viaPuzzle.has(`${chart.c},${chart.r}`)) throw new Error("Puzzle gates do not reach the chart");

  const corridor = bfs(solid, spawn.c, spawn.r);
  for (const spot of [CUTLASS_SPAWN, FLINTLOCK_SPAWN, SAILOR, PLAQUE]) {
    const c = Math.floor(spot.x / CELL);
    const r = Math.floor(spot.z / CELL);
    if (solid(c, r)) throw new Error(`Solid spawn at ${c},${r}`);
    if (!corridor.has(`${c},${r}`)) throw new Error(`Unreachable at ${c},${r}`);
  }
}
