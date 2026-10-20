import { useEffect, useRef, useState } from "react";
import { Pause } from "lucide-react";
import "@fontsource/silkscreen/latin-400.css";
import type { Bridge, LookStep, Snapshot } from "./types";
import { createBridge } from "./types";
import "./ashwake.css";

const INITIAL: Snapshot = {
  mode: "start",
  ready: false,
  hp: 100,
  hpMax: 100,
  objective: "Find the sailor in the stores.",
  prompt: null,
  toast: null,
  hasKey: false,
  tide: 0,
  enemyNear: false,
  blocking: false,
};

function lockLook(canvas: HTMLCanvasElement | null) {
  if (!canvas) return;
  const coarse = window.matchMedia("(pointer: coarse)").matches || window.innerWidth < 860;
  if (coarse) return;
  const pending = canvas.requestPointerLock({ unadjustedMovement: true });
  void Promise.resolve(pending).catch(() => {
    canvas.requestPointerLock();
  });
}

export function Ashwake() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hurtRef = useRef<HTMLDivElement>(null);
  const crossRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const bridgeRef = useRef<Bridge>(createBridge());
  const modeRef = useRef(INITIAL.mode);
  const [snap, setSnap] = useState<Snapshot>(INITIAL);
  const [lookH, setLookH] = useState<LookStep>("med");
  const [lookV, setLookV] = useState<LookStep>("med");
  const [error, setError] = useState<string | null>(null);
  modeRef.current = snap.mode;

  useEffect(() => {
    const bridge = bridgeRef.current;
    setLookH(bridge.lookH);
    setLookV(bridge.lookV);
    const canvas = canvasRef.current;
    const hurt = hurtRef.current;
    const cross = crossRef.current;
    const root = rootRef.current;
    if (!canvas || !hurt || !cross || !root) return;
    let dispose = () => {};
    let dead = false;
    const onDown = () => {
      if (modeRef.current === "play") lockLook(canvas);
    };
    canvas.addEventListener("pointerdown", onDown);
    void import("./engine").then(({ startGame }) => {
      if (dead) return;
      dispose = startGame({
        canvas,
        hurt,
        cross,
        root,
        bridge,
        onSnapshot: setSnap,
        onReady: (message) => setError(message ?? null),
      });
    });
    return () => {
      dead = true;
      canvas.removeEventListener("pointerdown", onDown);
      dispose();
    };
  }, []);

  const bridge = bridgeRef.current;
  const playing = snap.mode === "play";
  const crossClass = [
    "crosshair",
    playing ? "" : "is-hidden",
    snap.enemyNear ? "is-hot" : "",
    snap.blocking ? "is-block" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className="ashwake" ref={rootRef}>
      <canvas ref={canvasRef} aria-label="Ashwake Vault" />
      <div className="hurt" ref={hurtRef} />
      <div className={crossClass} ref={crossRef} />
      {playing || snap.mode === "pause" ? (
        <div className="topbar">
          <div className="hp" aria-label={`Health ${snap.hp}`}>
            <div className="hp-fill" style={{ width: `${(snap.hp / snap.hpMax) * 100}%` }} />
          </div>
          <p className="objective">{snap.objective}</p>
          {playing ? (
            <button className="pause-btn" type="button" aria-label="Pause" onClick={() => (bridge.pause = true)}>
              <Pause size={18} />
            </button>
          ) : (
            <span className="icon-btn" aria-hidden />
          )}
        </div>
      ) : null}
      {snap.toast && playing ? <p className="toast">{snap.toast}</p> : null}
      {snap.prompt && playing ? <p className="prompt">{snap.prompt}</p> : null}
      {snap.mode === "start" ? (
        <section className="card">
          <h1>Ashwake Vault</h1>
          <p className="lede">A wounded sailor is hiding in the stores. Mutineers have the hold.</p>
          <p>One cutlass. Two ways to swing it. A pistol is harder to block than a blade.</p>
          <div className="desktop-help">
            <h2>On a keyboard</h2>
            <ul>
              <li>WASD to walk. Mouse to look. Click the view to capture the mouse.</li>
              <li>Left click a quick strike. Right click a heavy strike. Hold F to block a blade.</li>
              <li>E interacts. Esc pauses. Pause sets look speed.</li>
            </ul>
          </div>
          <div className="mobile-help">
            <h2>On a phone</h2>
            <ul>
              <li>Left stick walks. Drag anywhere on the right side to look. Lift and drag again to keep turning.</li>
              <li>Quick, Heavy, Block, and Use are the corner buttons. They do not turn the view.</li>
              <li>Block a cutlass swing, then strike. A pistol wants the crates, or a rush while he reloads.</li>
              <li>Pause sets look speed: low, medium, or high, sideways and up-down separately.</li>
            </ul>
          </div>
          {error ? <p>{error}</p> : null}
          <div className="actions">
            <button
              className="primary"
              type="button"
              disabled={!snap.ready}
              onClick={() => {
                bridge.start = true;
                lockLook(canvasRef.current);
              }}
            >
              {snap.ready ? "Board the ship" : "Lighting the lamps…"}
            </button>
          </div>
        </section>
      ) : null}
      {snap.mode === "pause" ? (
        <section className="card">
          <h1>Paused</h1>
          <LookSettings
            bridge={bridge}
            lookH={lookH}
            lookV={lookV}
            onChange={(h, v) => {
              setLookH(h);
              setLookV(v);
            }}
          />
          <div className="actions">
            <button
              className="primary"
              type="button"
              onClick={() => {
                bridge.resume = true;
                lockLook(canvasRef.current);
              }}
            >
              Resume
            </button>
            <button type="button" onClick={() => (bridge.restart = true)}>
              Restart
            </button>
          </div>
        </section>
      ) : null}
      {snap.mode === "clue" ? (
        <section className="card clue">
          <h1>Water-stained chart</h1>
          <p>The margin is not the captain's hand.</p>
          <p>"We never left the harbor. The tide climbed through the deck, and the stars were already underwater."</p>
          <p>The course runs off the page. The compass rose has every point but north.</p>
          <div className="actions">
            <button className="primary" type="button" onClick={() => (bridge.dismissClue = true)}>
              Close the chart
            </button>
          </div>
        </section>
      ) : null}
      {snap.mode === "dead" ? (
        <section className="card">
          <h1>The deck wins this one</h1>
          <p>The cutlass is still in your hand. The chart room is not finished with you.</p>
          <div className="actions">
            <button className="primary" type="button" onClick={() => (bridge.restart = true)}>
              Try again
            </button>
          </div>
        </section>
      ) : null}
      {snap.mode === "won" ? (
        <section className="card">
          <h1>Open dark</h1>
          <p>You climb the companionway until the ship is only a bell, ringing once somewhere under you.</p>
          <p>The chart never says what sea this is.</p>
          <div className="actions">
            <button className="primary" type="button" onClick={() => (bridge.restart = true)}>
              Descend again
            </button>
          </div>
        </section>
      ) : null}
      <Touch bridge={bridge} hidden={!playing} />
    </div>
  );
}

function LookSettings({
  bridge,
  lookH,
  lookV,
  onChange,
}: {
  bridge: Bridge;
  lookH: LookStep;
  lookV: LookStep;
  onChange: (h: LookStep, v: LookStep) => void;
}) {
  const pick = (axis: "h" | "v", step: LookStep) => {
    if (axis === "h") {
      bridge.lookH = step;
      onChange(step, lookV);
      try {
        localStorage.setItem("ashwake-look-h", step);
      } catch {
        /* ignore */
      }
    } else {
      bridge.lookV = step;
      onChange(lookH, step);
      try {
        localStorage.setItem("ashwake-look-v", step);
      } catch {
        /* ignore */
      }
    }
  };
  return (
    <div className="look-settings">
      <LookRow label="Look left and right" value={lookH} onPick={(step) => pick("h", step)} />
      <LookRow label="Look up and down" value={lookV} onPick={(step) => pick("v", step)} />
    </div>
  );
}

function LookRow({ label, value, onPick }: { label: string; value: LookStep; onPick: (step: LookStep) => void }) {
  const steps: { id: LookStep; name: string }[] = [
    { id: "low", name: "Low" },
    { id: "med", name: "Medium" },
    { id: "high", name: "High" },
  ];
  return (
    <div className="look-row">
      <span>{label}</span>
      {steps.map((step) => (
        <button key={step.id} type="button" aria-pressed={value === step.id} onClick={() => onPick(step.id)}>
          {step.name}
        </button>
      ))}
    </div>
  );
}

function Touch({ bridge, hidden }: { bridge: Bridge; hidden: boolean }) {
  const stickRef = useRef<HTMLDivElement>(null);
  const knobRef = useRef<HTMLDivElement>(null);
  const lookRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stick = stickRef.current;
    const knob = knobRef.current;
    const look = lookRef.current;
    if (!stick || !knob || !look) return;
    let joyId: number | null = null;
    let originX = 0;
    let originY = 0;
    const max = 46;

    const moveJoy = (event: PointerEvent) => {
      if (event.pointerId !== joyId) return;
      const dx = event.clientX - originX;
      const dy = event.clientY - originY;
      const mag = Math.hypot(dx, dy) || 1;
      const clamped = Math.min(max, mag);
      const nx = (dx / mag) * clamped;
      const ny = (dy / mag) * clamped;
      const dead = clamped / max < 0.16;
      bridge.joyX = dead ? 0 : nx / max;
      bridge.joyY = dead ? 0 : -ny / max;
      knob.style.transform = `translate(${nx}px, ${ny}px)`;
    };
    const endJoy = (event: PointerEvent) => {
      if (event.pointerId !== joyId) return;
      joyId = null;
      bridge.joyX = 0;
      bridge.joyY = 0;
      knob.style.transform = "translate(0px, 0px)";
    };
    const downJoy = (event: PointerEvent) => {
      joyId = event.pointerId;
      originX = event.clientX;
      originY = event.clientY;
      stick.setPointerCapture(event.pointerId);
    };

    let lookId: number | null = null;
    let lastX = 0;
    let lastY = 0;
    const downLook = (event: PointerEvent) => {
      lookId = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      look.setPointerCapture(event.pointerId);
    };
    const moveLook = (event: PointerEvent) => {
      if (event.pointerId !== lookId) return;
      bridge.lookDx += event.clientX - lastX;
      bridge.lookDy += event.clientY - lastY;
      lastX = event.clientX;
      lastY = event.clientY;
    };
    const endLook = (event: PointerEvent) => {
      if (event.pointerId === lookId) lookId = null;
    };

    stick.addEventListener("pointerdown", downJoy);
    stick.addEventListener("pointermove", moveJoy);
    stick.addEventListener("pointerup", endJoy);
    stick.addEventListener("pointercancel", endJoy);
    look.addEventListener("pointerdown", downLook);
    look.addEventListener("pointermove", moveLook);
    look.addEventListener("pointerup", endLook);
    look.addEventListener("pointercancel", endLook);
    return () => {
      stick.removeEventListener("pointerdown", downJoy);
      stick.removeEventListener("pointermove", moveJoy);
      stick.removeEventListener("pointerup", endJoy);
      stick.removeEventListener("pointercancel", endJoy);
      look.removeEventListener("pointerdown", downLook);
      look.removeEventListener("pointermove", moveLook);
      look.removeEventListener("pointerup", endLook);
      look.removeEventListener("pointercancel", endLook);
    };
  }, [bridge]);

  return (
    <div className="touch" style={{ visibility: hidden ? "hidden" : "visible" }} aria-hidden={hidden}>
      <div className="look-catch" ref={lookRef} aria-label="Look" />
      <div className="stick" ref={stickRef} aria-label="Move">
        <div className="knob" ref={knobRef} />
      </div>
      <div className="touch-actions">
        <button
          type="button"
          onPointerDown={(event) => {
            event.stopPropagation();
            bridge.queueAttack = "quick";
          }}
        >
          Quick
        </button>
        <button
          type="button"
          onPointerDown={(event) => {
            event.stopPropagation();
            bridge.queueAttack = "heavy";
          }}
        >
          Heavy
        </button>
        <button
          type="button"
          onPointerDown={(event) => {
            event.stopPropagation();
            event.currentTarget.setPointerCapture(event.pointerId);
            bridge.blocking = true;
          }}
          onPointerUp={() => (bridge.blocking = false)}
          onPointerCancel={() => (bridge.blocking = false)}
        >
          Block
        </button>
        <button
          type="button"
          onPointerDown={(event) => {
            event.stopPropagation();
            bridge.queueInteract = true;
          }}
        >
          Use
        </button>
      </div>
    </div>
  );
}
