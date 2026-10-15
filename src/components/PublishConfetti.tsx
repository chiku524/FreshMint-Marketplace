"use client";

import { useEffect, useRef } from "react";

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  rot: number;
  vr: number;
  color: string;
  life: number;
};

/** Brief, muted confetti burst — mint + gold, light/dark safe. */
export function PublishConfetti({ active }: { active: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const resize = () => {
      const { innerWidth: w, innerHeight: h } = window;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();

    const styles = getComputedStyle(document.documentElement);
    const mint =
      styles.getPropertyValue("--mint-leaf").trim() ||
      styles.getPropertyValue("--emergent").trim() ||
      "#6ecf9a";
    const gold =
      styles.getPropertyValue("--accent").trim() || "#c9a46a";
    const inkMuted =
      styles.getPropertyValue("--ink-muted").trim() || "#8a8478";
    const palette = [mint, gold, inkMuted, mint, gold];

    const count = 72;
    const particles: Particle[] = Array.from({ length: count }, () => {
      const side = Math.random();
      const x =
        side < 0.5
          ? Math.random() * window.innerWidth * 0.45
          : window.innerWidth * 0.55 + Math.random() * window.innerWidth * 0.45;
      return {
        x,
        y: -12 - Math.random() * 40,
        vx: (Math.random() - 0.5) * 3.2,
        vy: 1.6 + Math.random() * 2.8,
        w: 4 + Math.random() * 5,
        h: 6 + Math.random() * 8,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.18,
        color: palette[Math.floor(Math.random() * palette.length)]!,
        life: 1,
      };
    });

    let frame = 0;
    let raf = 0;
    const maxFrames = 150; // ~2.5s at 60fps
    const tick = () => {
      frame += 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      ctx.clearRect(0, 0, w, h);
      for (const p of particles) {
        p.vy += 0.045;
        p.vx *= 0.995;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        p.life = Math.max(0, 1 - frame / maxFrames);
        if (p.life <= 0) continue;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.globalAlpha = 0.55 * p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      }
      if (frame < maxFrames) {
        raf = requestAnimationFrame(tick);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
    };
    raf = requestAnimationFrame(tick);

    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    };
  }, [active]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      className="publish-confetti"
      aria-hidden="true"
    />
  );
}
