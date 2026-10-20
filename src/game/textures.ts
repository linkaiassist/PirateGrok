import * as THREE from "three";

export type TexSet = {
  wood: THREE.CanvasTexture;
  stone: THREE.CanvasTexture;
  chapel: THREE.CanvasTexture;
  vault: THREE.CanvasTexture;
  brick: THREE.CanvasTexture;
  vaultWall: THREE.CanvasTexture;
  copper: THREE.CanvasTexture;
  ceiling: THREE.CanvasTexture;
  mural: THREE.CanvasTexture;
  flood: THREE.CanvasTexture;
  ebb: THREE.CanvasTexture;
  slack: THREE.CanvasTexture;
  chart: THREE.CanvasTexture;
  flame: THREE.CanvasTexture;
  notice: THREE.CanvasTexture;
};

const INK = "#2a1c14";
const HULL = ["#c4844e", "#a86a38", "#d09a62", "#8d5830"];
const PLANK = ["#e0b07a", "#c48a52", "#f0c898", "#a86c3c"];
const BONE = "#f0e2c8";
const AMBER = "#e2a04a";
const TEAL = "#3f8f78";

function hash(x: number, y: number): number {
  let n = (x * 374761393 + y * 668265263) | 0;
  n = (n ^ (n >> 13)) >>> 0;
  return n % 1000;
}

function canvas(size: number, draw: (ctx: CanvasRenderingContext2D, s: number) => void): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.imageSmoothingEnabled = false;
  draw(ctx, size);
  const tex = new THREE.CanvasTexture(c);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}

function hullPlanks(): THREE.CanvasTexture {
  return canvas(64, (ctx) => {
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 10) {
      ctx.fillStyle = HULL[hash(x, 3) % HULL.length]!;
      ctx.fillRect(x, 0, 8, 64);
      ctx.fillStyle = "#4a301c";
      ctx.fillRect(x + 3, 10, 2, 2);
      ctx.fillRect(x + 3, 42, 2, 2);
    }
  });
}

function cabinPanels(): THREE.CanvasTexture {
  return canvas(64, (ctx) => {
    ctx.fillStyle = "#6a4832";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "#8d6244";
    ctx.fillRect(3, 3, 26, 58);
    ctx.fillRect(35, 3, 26, 58);
    ctx.fillStyle = AMBER;
    ctx.fillRect(30, 0, 4, 64);
    ctx.fillStyle = "#3a2418";
    ctx.fillRect(8, 16, 16, 2);
    ctx.fillRect(40, 40, 16, 2);
  });
}

export function makeTextures(): TexSet {
  const wood = canvas(64, (ctx) => {
    ctx.fillStyle = "#6a4328";
    ctx.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 12) {
      ctx.fillStyle = PLANK[hash(x, 2) % PLANK.length]!;
      ctx.fillRect(x, 0, 10, 64);
      ctx.fillStyle = "#3a2416";
      for (let y = 6; y < 64; y += 18) ctx.fillRect(x + 4, y, 2, 2);
    }
  });

  const stone = canvas(64, (ctx) => {
    ctx.fillStyle = "#4a301c";
    ctx.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 12) {
      ctx.fillStyle = hash(x, 5) % 2 ? "#8d6240" : "#6e4c30";
      ctx.fillRect(x, 0, 10, 64);
      if (hash(x, 9) > 700) {
        ctx.fillStyle = "#2a1c14";
        ctx.fillRect(x + 2, 20, 6, 3);
      }
    }
  });

  const chapel = canvas(64, (ctx) => {
    ctx.fillStyle = "#d7c4a4";
    ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 16) {
      for (let x = 0; x < 64; x += 16) {
        ctx.fillStyle = (x / 16 + y / 16) % 2 ? "#efe2cc" : "#cbb892";
        ctx.fillRect(x, y, 16, 16);
        ctx.strokeStyle = TEAL;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 2, y + 2, 12, 12);
      }
    }
  });

  const vault = canvas(64, (ctx) => {
    ctx.fillStyle = "#5c4030";
    ctx.fillRect(0, 0, 64, 64);
    for (let y = 0; y < 64; y += 32) {
      for (let x = 0; x < 64; x += 32) {
        ctx.fillStyle = "#7a5640";
        ctx.fillRect(x + 2, y + 2, 28, 28);
        ctx.fillStyle = AMBER;
        ctx.fillRect(x + 2, y + 2, 28, 2);
        ctx.fillRect(x + 2, y + 2, 2, 28);
      }
    }
  });

  const copper = canvas(64, (ctx) => {
    ctx.fillStyle = INK;
    ctx.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 10) {
      const marked = x === 20 || x === 30;
      ctx.fillStyle = marked ? AMBER : HULL[hash(x, 7) % HULL.length]!;
      ctx.fillRect(x, 0, 8, 64);
    }
    ctx.fillStyle = "#6a3a22";
    ctx.fillRect(24, 8, 10, 4);
    ctx.fillRect(22, 18, 14, 3);
    ctx.fillRect(27, 18, 4, 28);
  });

  const ceiling = canvas(64, (ctx) => {
    ctx.fillStyle = "#5c4030";
    ctx.fillRect(0, 0, 64, 64);
    for (let x = 0; x < 64; x += 16) {
      ctx.fillStyle = "#3a281c";
      ctx.fillRect(x, 0, 4, 64);
      ctx.fillStyle = "#8d6244";
      ctx.fillRect(x + 4, 0, 12, 64);
    }
  });

  const mural = canvas(192, (ctx, s) => {
    ctx.fillStyle = "#1a1410";
    ctx.fillRect(0, 0, s, s);
    ctx.fillStyle = "#3a2c22";
    ctx.fillRect(4, 4, s - 8, s - 8);
    const glyphs: Record<string, string[]> = {
      A: ["010", "101", "111", "101", "101"],
      B: ["110", "101", "110", "101", "110"],
      C: ["111", "100", "100", "100", "111"],
      D: ["110", "101", "101", "101", "110"],
      E: ["111", "100", "110", "100", "111"],
      F: ["111", "100", "110", "100", "100"],
      K: ["101", "110", "100", "110", "101"],
      L: ["100", "100", "100", "100", "111"],
      O: ["111", "101", "101", "101", "111"],
      S: ["111", "100", "111", "001", "111"],
    };
    const paintWord = (word: string, x: number, y: number, color: string) => {
      const scale = 2;
      const step = 9;
      ctx.fillStyle = color;
      [...word].forEach((ch, i) => {
        glyphs[ch]?.forEach((row, ry) => {
          [...row].forEach((bit, rx) => {
            if (bit === "1") ctx.fillRect(x + i * step + rx * scale, y + ry * scale, scale, scale);
          });
        });
      });
    };
    const panels = [
      { word: "FLOOD", color: AMBER, waves: "up" },
      { word: "EBB", color: TEAL, waves: "down" },
      { word: "SLACK", color: BONE, waves: "still" },
    ] as const;
    panels.forEach((panel, i) => {
      const x = 10 + i * 60;
      ctx.fillStyle = "#140e0c";
      ctx.fillRect(x, 12, 54, 168);
      ctx.fillStyle = panel.color;
      const digit = [
        [
          [0, 1, 0],
          [1, 1, 0],
          [0, 1, 0],
          [0, 1, 0],
          [1, 1, 1],
        ],
        [
          [1, 1, 1],
          [0, 0, 1],
          [1, 1, 1],
          [1, 0, 0],
          [1, 1, 1],
        ],
        [
          [1, 1, 1],
          [0, 0, 1],
          [1, 1, 1],
          [0, 0, 1],
          [1, 1, 1],
        ],
      ][i]!;
      digit.forEach((row, ry) => {
        row.forEach((bit, rx) => {
          if (bit) ctx.fillRect(x + 16 + rx * 6, 20 + ry * 6, 5, 5);
        });
      });
      const wordX = x + (54 - panel.word.length * 9) / 2;
      paintWord(panel.word, wordX, 60, panel.color);
      ctx.fillStyle = panel.color;
      if (panel.waves === "up") {
        ctx.fillRect(x + 10, 110, 34, 5);
        ctx.fillRect(x + 10, 96, 34, 5);
        ctx.fillRect(x + 18, 84, 18, 5);
      } else if (panel.waves === "down") {
        ctx.fillRect(x + 8, 90, 38, 5);
        ctx.fillRect(x + 8, 108, 26, 5);
        ctx.fillRect(x + 8, 126, 14, 5);
      } else {
        ctx.fillRect(x + 8, 118, 38, 5);
        ctx.fillRect(x + 18, 100, 18, 14);
      }
    });
  });

  const icon = (kind: "flood" | "ebb" | "slack", color: string) =>
    canvas(32, (ctx) => {
      ctx.fillStyle = "#140e0c";
      ctx.fillRect(0, 0, 32, 32);
      ctx.fillStyle = color;
      if (kind === "flood") {
        ctx.fillRect(4, 18, 24, 3);
        ctx.fillRect(4, 10, 24, 3);
        ctx.fillRect(12, 4, 8, 3);
      } else if (kind === "ebb") {
        ctx.fillRect(4, 8, 24, 3);
        ctx.fillRect(4, 16, 18, 3);
        ctx.fillRect(4, 24, 12, 3);
      } else {
        ctx.fillRect(4, 20, 24, 3);
        ctx.fillRect(10, 12, 12, 8);
      }
    });

  const chart = canvas(128, (ctx) => {
    ctx.fillStyle = "#cbb892";
    ctx.fillRect(0, 0, 128, 128);
    ctx.fillStyle = "#8a7050";
    for (let i = 0; i < 128; i += 4) {
      if (hash(i, 2) > 800) ctx.fillRect(i, hash(i, 4) % 128, 2, 1);
    }
    ctx.strokeStyle = "#3a2a1c";
    ctx.lineWidth = 2;
    ctx.strokeRect(8, 8, 112, 112);
    ctx.beginPath();
    ctx.arc(64, 64, 28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(64, 64, 4, 0, Math.PI * 2);
    ctx.stroke();
    for (let i = 0; i < 8; i++) {
      if (i === 6) continue;
      const a = (i / 8) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(64 + Math.cos(a) * 16, 64 + Math.sin(a) * 16);
      ctx.lineTo(64 + Math.cos(a) * 28, 64 + Math.sin(a) * 28);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(16, 96);
    ctx.lineTo(40, 70);
    ctx.lineTo(70, 78);
    ctx.lineTo(120, 40);
    ctx.stroke();
  });

  const flame = canvas(32, (ctx) => {
    ctx.clearRect(0, 0, 32, 32);
    ctx.fillStyle = "#e2a04a";
    ctx.fillRect(12, 6, 8, 18);
    ctx.fillStyle = "#c4553a";
    ctx.fillRect(14, 14, 4, 10);
    ctx.fillStyle = "#f0d2a0";
    ctx.fillRect(14, 8, 4, 6);
  });
  flame.wrapS = THREE.ClampToEdgeWrapping;
  flame.wrapT = THREE.ClampToEdgeWrapping;

  const notice = canvas(64, (ctx) => {
    ctx.fillStyle = "#f3e6d0";
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = "#6a3a24";
    ctx.fillRect(0, 0, 64, 5);
    ctx.fillRect(0, 59, 64, 5);
    ctx.fillRect(0, 0, 5, 64);
    ctx.fillRect(59, 0, 5, 64);
    ctx.fillStyle = "#c4553a";
    ctx.fillRect(44, 10, 10, 10);
    ctx.fillStyle = "#2a1c14";
    for (let y = 22; y <= 48; y += 7) ctx.fillRect(10, y, y === 48 ? 18 : 30, 2);
  });

  return {
    wood,
    stone,
    chapel,
    vault,
    brick: hullPlanks(),
    vaultWall: cabinPanels(),
    copper,
    ceiling,
    mural,
    flood: icon("flood", AMBER),
    ebb: icon("ebb", TEAL),
    slack: icon("slack", BONE),
    chart,
    flame,
    notice,
  };
}
