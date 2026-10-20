import * as THREE from "three";
import { CELL, HEIGHT, MAP_H, MAP_W, floorKind, type FloorKind } from "./map";
import type { TexSet } from "./textures";

type Bucket = { pos: number[]; norm: number[]; uv: number[] };

function empty(): Bucket {
  return { pos: [], norm: [], uv: [] };
}

function quad(bucket: Bucket, verts: number[][], normal: number[], uvs: number[][]) {
  const ax = verts[1]![0]! - verts[0]![0]!;
  const ay = verts[1]![1]! - verts[0]![1]!;
  const az = verts[1]![2]! - verts[0]![2]!;
  const bx = verts[2]![0]! - verts[0]![0]!;
  const by = verts[2]![1]! - verts[0]![1]!;
  const bz = verts[2]![2]! - verts[0]![2]!;
  const cx = ay * bz - az * by;
  const cy = az * bx - ax * bz;
  const cz = ax * by - ay * bx;
  const flip = cx * normal[0]! + cy * normal[1]! + cz * normal[2]! < 0;
  const order = flip ? [0, 3, 2, 1] : [0, 1, 2, 3];
  const tris = [order[0]!, order[1]!, order[2]!, order[0]!, order[2]!, order[3]!];
  for (const index of tris) {
    const v = verts[index]!;
    const uv = uvs[index]!;
    bucket.pos.push(v[0]!, v[1]!, v[2]!);
    bucket.norm.push(normal[0]!, normal[1]!, normal[2]!);
    bucket.uv.push(uv[0]!, uv[1]!);
  }
}

function toGeometry(bucket: Bucket): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(bucket.pos, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(bucket.norm, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(bucket.uv, 2));
  return geometry;
}

function isWall(grid: string[][], col: number, row: number): boolean {
  if (row < 0 || col < 0 || row >= MAP_H || col >= MAP_W) return true;
  const ch = grid[row]![col];
  return ch === "#" || ch === "S";
}

export function buildMapMesh(grid: string[][], tex: TexSet): THREE.Group {
  const floors: Record<FloorKind, Bucket> = {
    wood: empty(),
    stone: empty(),
    chapel: empty(),
    vault: empty(),
  };
  const walls = { brick: empty(), vault: empty(), copper: empty() };
  const ceiling = empty();
  const uv = [
    [0, 0],
    [1, 0],
    [1, 1],
    [0, 1],
  ];

  for (let row = 0; row < MAP_H; row++) {
    for (let col = 0; col < MAP_W; col++) {
      if (grid[row]![col] !== ".") continue;
      const x0 = col * CELL;
      const x1 = x0 + CELL;
      const z0 = row * CELL;
      const z1 = z0 + CELL;
      const kind = floorKind(col, row);
      quad(
        floors[kind],
        [
          [x0, 0, z1],
          [x1, 0, z1],
          [x1, 0, z0],
          [x0, 0, z0],
        ],
        [0, 1, 0],
        [
          [0, 1],
          [1, 1],
          [1, 0],
          [0, 0],
        ],
      );
      quad(
        ceiling,
        [
          [x0, HEIGHT, z0],
          [x1, HEIGHT, z0],
          [x1, HEIGHT, z1],
          [x0, HEIGHT, z1],
        ],
        [0, -1, 0],
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ],
      );

      const pushWall = (nc: number, nr: number, verts: number[][], normal: number[]) => {
        if (!isWall(grid, nc, nr)) return;
        const ch = nr >= 0 && nr < MAP_H && nc >= 0 && nc < MAP_W ? grid[nr]![nc] : "#";
        const bucket = ch === "S" ? walls.copper : kind === "vault" ? walls.vault : walls.brick;
        quad(bucket, verts, normal, uv);
      };

      pushWall(
        col,
        row - 1,
        [
          [x1, 0, z0],
          [x0, 0, z0],
          [x0, HEIGHT, z0],
          [x1, HEIGHT, z0],
        ],
        [0, 0, 1],
      );
      pushWall(
        col,
        row + 1,
        [
          [x0, 0, z1],
          [x1, 0, z1],
          [x1, HEIGHT, z1],
          [x0, HEIGHT, z1],
        ],
        [0, 0, -1],
      );
      pushWall(
        col - 1,
        row,
        [
          [x0, 0, z0],
          [x0, 0, z1],
          [x0, HEIGHT, z1],
          [x0, HEIGHT, z0],
        ],
        [1, 0, 0],
      );
      pushWall(
        col + 1,
        row,
        [
          [x1, 0, z1],
          [x1, 0, z0],
          [x1, HEIGHT, z0],
          [x1, HEIGHT, z1],
        ],
        [-1, 0, 0],
      );
    }
  }

  const group = new THREE.Group();
  const add = (bucket: Bucket, map: THREE.Texture) => {
    if (!bucket.pos.length) return;
    group.add(new THREE.Mesh(toGeometry(bucket), new THREE.MeshLambertMaterial({ map })));
  };
  add(floors.wood, tex.wood);
  add(floors.stone, tex.stone);
  add(floors.chapel, tex.chapel);
  add(floors.vault, tex.vault);
  add(walls.brick, tex.brick);
  add(walls.vault, tex.vaultWall);
  add(walls.copper, tex.copper);
  add(ceiling, tex.ceiling);
  return group;
}

export function disposeObject(root: THREE.Object3D) {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
}
