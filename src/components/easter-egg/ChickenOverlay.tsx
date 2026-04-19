import { useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";

interface Props {
  onClose: () => void;
}

const SPRITES = [
  "/chicken/chicken_fall.png",
  "/chicken/chicken_impact.png",
  "/chicken/chicken_idle.png",
  "/chicken/chicken_flex.png",
];

const LETTERS = ["C", "L", "U", "C", "K"];
const LETTER_START = 1600;
const LETTER_GAP = 185;
const LOOP_START = LETTER_START + LETTERS.length * LETTER_GAP + 400;
const FALL_DUR = 580;
const IMPACT_HOLD = 320;
const FONT = "'Press Start 2P', monospace";
const HUD_H = 72;

export function ChickenOverlay({ onClose }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);
  const startRef = useRef<number | null>(null);
  const shakeRef = useRef({ x: 0, y: 0 });
  const sparksRef = useRef<Spark[]>([]);
  const sparksSpawnedRef = useRef(false);
  const imgsRef = useRef<HTMLImageElement[]>([]);
  const sizesRef = useRef<[number, number][]>([]);

  interface Spark {
    x: number; y: number; vx: number; vy: number;
    life: number; decay: number; size: number; color: string;
  }

  const spawnSparks = useCallback((cx: number, floorY: number) => {
    const colors = ["#ff4dc4", "#c026d3", "#a855f7", "#fff", "#ffdd00"];
    for (let i = 0; i < 50; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = Math.random() * 10 + 4;
      sparksRef.current.push({
        x: cx, y: floorY,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 5,
        life: 1, decay: Math.random() * 0.018 + 0.012,
        size: Math.floor(Math.random() * 5) + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
      });
    }
  }, []);

  const animate = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d")!;
    const W = canvas.width, H = canvas.height;
    const CX = W / 2;
    const DRAW_H = H * 0.88;
    const FLOOR_Y = H * 1.10;
    const LAND_Y = FLOOR_Y;
    const VISIBLE_FLOOR = H * 0.92;

    const tick = (ts: number) => {
      if (!startRef.current) startRef.current = ts;
      const t = ts - startRef.current;
      const sh = shakeRef.current;
      sh.x *= 0.65; sh.y *= 0.65;

      ctx.clearRect(0, 0, W, H);

      // bg
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, "#050010"); bg.addColorStop(1, "#0a0020");
      ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H);

      // pixel grid
      ctx.save(); ctx.globalAlpha = 0.03; ctx.strokeStyle = "#a855f7"; ctx.lineWidth = 1;
      for (let x = 0; x < W; x += 40) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y < H; y += 40) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.restore();

      // floor
      ctx.save(); ctx.globalAlpha = Math.min(t / 400, 1);
      const TILE = 48;
      for (let row = 0; row < 6; row++) {
        for (let col = 0; col * TILE < W; col++) {
          ctx.fillStyle = (col + row) % 2 === 0 ? "#1a0a2e" : "#0f0620";
          ctx.fillRect(col * TILE, VISIBLE_FLOOR + row * TILE, TILE, TILE);
        }
      }
      const floorGrad = ctx.createLinearGradient(0, VISIBLE_FLOOR, 0, VISIBLE_FLOOR + 4);
      floorGrad.addColorStop(0, "#ff4dc4"); floorGrad.addColorStop(1, "transparent");
      ctx.fillStyle = floorGrad; ctx.fillRect(0, VISIBLE_FLOOR, W, 4);
      ctx.strokeStyle = "rgba(255,77,196,0.12)"; ctx.lineWidth = 1;
      for (let col = 0; col * TILE <= W; col++) {
        ctx.beginPath(); ctx.moveTo(col * TILE, VISIBLE_FLOOR); ctx.lineTo(CX, H * 1.8); ctx.stroke();
      }
      ctx.restore();

      // sparks
      if (t > FALL_DUR && !sparksSpawnedRef.current) {
        spawnSparks(CX, VISIBLE_FLOOR);
        sparksSpawnedRef.current = true;
      }
      const sparks = sparksRef.current;
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        s.x += s.vx; s.y += s.vy; s.vy += 0.3; s.life -= s.decay;
        if (s.life <= 0) { sparks.splice(i, 1); continue; }
        ctx.save(); ctx.globalAlpha = s.life;
        ctx.fillStyle = s.color;
        ctx.fillRect(Math.round(s.x), Math.round(s.y), s.size, s.size);
        ctx.restore();
      }

      // chicken
      const drawFrame = (idx: number, cx: number, footY: number, sx = 1, sy = 1) => {
        const img = imgsRef.current[idx];
        const [fw, fh] = sizesRef.current[idx] ?? [1, 1];
        const s = DRAW_H / fh;
        const dw = fw * s * sx, dh = fh * s * sy;
        ctx.drawImage(img, cx - dw / 2 + sh.x, footY - dh + sh.y, dw, dh);
      };

      if (t < FALL_DUR) {
        const footY = -20 + (LAND_Y + 20) * (t / FALL_DUR) ** 2;
        drawFrame(0, CX, footY);
      } else if (t < FALL_DUR + IMPACT_HOLD) {
        const p = (t - FALL_DUR) / IMPACT_HOLD;
        if (p < 0.18) {
          sh.x = 28 * (1 - p / 0.18); sh.y = 20 * (1 - p / 0.18);
          ctx.fillStyle = `rgba(255,255,255,${0.4 * (1 - p / 0.18)})`;
          ctx.fillRect(0, 0, W, H);
        }
        drawFrame(1, CX, LAND_Y, p < 0.4 ? 1 + (1 - p / 0.4) * 0.13 : 1, p < 0.4 ? 1 - (1 - p / 0.4) * 0.11 : 1);
      } else if (t < LETTER_START) {
        const p = (t - FALL_DUR - IMPACT_HOLD) / (LETTER_START - FALL_DUR - IMPACT_HOLD);
        drawFrame(2, CX, LAND_Y - Math.sin(p * Math.PI) * 18);
      } else if (t < LOOP_START) {
        drawFrame(3, CX, LAND_Y);
      } else {
        const pulse = 1 + Math.sin((t - LOOP_START) / 500) * 0.028;
        drawFrame(3, CX, LAND_Y, pulse, pulse);
      }

      // scanlines
      for (let y = 0; y < H; y += 4) { ctx.fillStyle = "rgba(0,0,0,0.07)"; ctx.fillRect(0, y, W, 2); }

      // vignette
      const v = ctx.createRadialGradient(CX, H * 0.5, H * 0.1, CX, H * 0.5, H * 0.85);
      v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.72)");
      ctx.fillStyle = v; ctx.fillRect(0, 0, W, H);

      // HUD
      drawHUD(ctx, W, H, CX, t);

      // FIGHT intro
      drawFightIntro(ctx, W, H, CX, t);

      // CLUCK letters
      if (t >= LETTER_START) {
        const bokY = HUD_H + Math.min(W, H) * 0.08;
        const totalW = Math.min(W * 0.65, 620);
        const pulse = 0.5 + 0.5 * Math.sin(t / 400);
        LETTERS.forEach((ch, i) => {
          const lt = LETTER_START + i * LETTER_GAP;
          if (t < lt) return;
          const x = CX - totalW / 2 + (i + 0.5) * (totalW / LETTERS.length);
          const el = t - lt;
          if (el < 300) drawLetterPop(ctx, ch, el / 300, x, bokY, W, H);
          else drawLetterGlow(ctx, ch, x, bokY, pulse, W, H);
        });
      }

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
  }, [spawnSparks]);

  useEffect(() => {
    let loaded = 0;
    imgsRef.current = SPRITES.map((src, i) => {
      const img = new Image();
      img.onload = () => {
        sizesRef.current[i] = [img.naturalWidth, img.naturalHeight];
        if (++loaded === SPRITES.length) animate();
      };
      img.src = src;
      return img;
    });

    return () => cancelAnimationFrame(rafRef.current);
  }, [animate]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);

  return createPortal(
    <div
      className="fixed inset-0 z-[9999]"
      onClick={onClose}
    >
      <canvas ref={canvasRef} className="block w-full h-full" />
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-[9px] text-[#222] tracking-widest uppercase"
        style={{ fontFamily: FONT }}>
        press esc or click to dismiss
      </div>
    </div>,
    document.body
  );
}

// ── helpers (pure canvas, no React) ───────────────────────────────

function drawHUD(ctx: CanvasRenderingContext2D, W: number, H: number, CX: number, t: number) {
  const alpha = Math.min(t / 300, 1);
  ctx.save(); ctx.globalAlpha = alpha;

  const BAR_W = Math.min(W * 0.36, 300), BAR_H = 18, BAR_Y = 38, PAD = 20;

  ctx.fillStyle = "rgba(0,0,0,0.75)"; ctx.fillRect(0, 0, W, HUD_H);
  ctx.strokeStyle = "#ff4dc4"; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, HUD_H); ctx.lineTo(W, HUD_H); ctx.stroke();

  const drawBar = (x: number) => {
    ctx.fillStyle = "#1a0020"; ctx.fillRect(x, BAR_Y, BAR_W, BAR_H);
    ctx.strokeStyle = "#ff4dc4"; ctx.lineWidth = 2; ctx.strokeRect(x, BAR_Y, BAR_W, BAR_H);
    const g = ctx.createLinearGradient(x, 0, x + BAR_W, 0);
    g.addColorStop(0, "#ff4dc4"); g.addColorStop(0.5, "#c026d3"); g.addColorStop(1, "#7c3aed");
    ctx.fillStyle = g; ctx.fillRect(x + 2, BAR_Y + 2, BAR_W - 4, BAR_H - 4);
    ctx.fillStyle = "rgba(255,255,255,0.15)"; ctx.fillRect(x + 2, BAR_Y + 2, BAR_W - 4, 5);
  };
  drawBar(PAD); drawBar(W - PAD - BAR_W);

  ctx.font = `7px ${FONT}`; ctx.fillStyle = "#ffdd00";
  ctx.textAlign = "left";  ctx.fillText("GRAND MASTER CHICKEN", PAD, BAR_Y - 8);
  ctx.textAlign = "right"; ctx.fillText("PLAYER", W - PAD, BAR_Y - 8);

  const tw = 56, th = 30, tx = CX - tw / 2, ty = BAR_Y - 4;
  ctx.fillStyle = "#0a0015"; ctx.fillRect(tx, ty, tw, th);
  ctx.strokeStyle = "#ff4dc4"; ctx.lineWidth = 2; ctx.strokeRect(tx, ty, tw, th);
  const secs = Math.max(0, Math.floor(99 - (t / 1000) * 3));
  ctx.font = `16px ${FONT}`; ctx.fillStyle = "#ffdd00";
  ctx.textAlign = "center"; ctx.fillText(String(secs).padStart(2, "0"), CX, ty + 22);

  ctx.font = `6px ${FONT}`; ctx.fillStyle = "#ff4dc4";
  ctx.fillText("● ○ ○", CX, ty + th + 12);

  ctx.restore();
}

function drawFightIntro(ctx: CanvasRenderingContext2D, W: number, H: number, CX: number, t: number) {
  if (t < 900) {
    const p = t < 400 ? t / 400 : 1 - (t - 400) / 500;
    const sc = t < 400 ? 0.6 + 0.4 * (t / 400) : 1;
    ctx.save(); ctx.globalAlpha = Math.max(0, p);
    ctx.translate(CX, H * 0.45); ctx.scale(sc, sc);
    ctx.font = `20px ${FONT}`; ctx.fillStyle = "#ffdd00";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "#c026d3"; ctx.shadowBlur = 20;
    ctx.strokeStyle = "#c026d3"; ctx.lineWidth = 3;
    ctx.strokeText("ROUND 1", 0, 0); ctx.fillText("ROUND 1", 0, 0);
    ctx.restore();
  }
  if (t >= 500 && t < 1300) {
    const p = t < 700 ? (t - 500) / 200 : 1 - (t - 700) / 600;
    const sc = t < 700 ? 0.5 + ((t - 500) / 200) * 0.7 : 1.2;
    ctx.save(); ctx.globalAlpha = Math.max(0, p);
    ctx.translate(CX, H * 0.52); ctx.scale(sc, sc);
    ctx.font = `42px ${FONT}`; ctx.fillStyle = "#fff";
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "#ff4dc4"; ctx.shadowBlur = 50;
    ctx.strokeStyle = "#c026d3"; ctx.lineWidth = 6;
    ctx.strokeText("FIGHT!", 0, 0); ctx.fillText("FIGHT!", 0, 0);
    ctx.restore();
  }
}

function drawLetterPop(ctx: CanvasRenderingContext2D, ch: string, progress: number, x: number, y: number, W: number, H: number) {
  const t = Math.min(progress, 1);
  const sc = t < 0.55 ? (t / 0.55) * 1.4 : 1.4 - ((t - 0.55) / 0.45) * 0.4;
  const sz = Math.min(W, H) * 0.09;
  ctx.save();
  ctx.globalAlpha = Math.min(t * 5, 1);
  ctx.translate(x, y); ctx.rotate((1 - t) * -0.25); ctx.scale(sc, sc);
  ctx.font = `${sz}px ${FONT}`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.shadowColor = "#ff4dc4"; ctx.shadowBlur = 60;
  ctx.strokeStyle = "#c026d3"; ctx.lineWidth = 4;
  ctx.strokeText(ch, 0, 0); ctx.fillStyle = "#fff"; ctx.fillText(ch, 0, 0);
  ctx.restore();
}

function drawLetterGlow(ctx: CanvasRenderingContext2D, ch: string, x: number, y: number, pulse: number, W: number, H: number) {
  const sz = Math.min(W, H) * 0.09;
  ctx.save(); ctx.font = `${sz}px ${FONT}`;
  ctx.textAlign = "center"; ctx.textBaseline = "middle";
  ctx.shadowColor = "#ff4dc4"; ctx.shadowBlur = 20 + 30 * pulse;
  ctx.strokeStyle = "#c026d3"; ctx.lineWidth = 4;
  ctx.strokeText(ch, x, y); ctx.fillStyle = "#fff"; ctx.fillText(ch, x, y);
  ctx.restore();
}
