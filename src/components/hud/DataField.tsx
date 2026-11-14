"use client";

// 中心の球体の周りを、データが流れ続ける背景（キーミスが「生きている」感じを出す）。
// - 外から中心へ流れ込む光の粒
// - 球体の周りを回る小さな粒（軌道）
// - 声や考え中に合わせて揺れる波形のリング
// - 画面の端を、ゆっくり流れる 16 進数の列
// canvas に描くので、要素が多くても軽い。動きを減らす設定の人には、止まった絵だけを描く。

import { useEffect, useRef } from "react";
import type { RingMode, RingTone } from "./Ring";

const TONE_RGB: Record<RingTone, string> = {
  normal: "34,211,238",
  warn: "251,191,36",
  offline: "148,163,184",
};

type Particle = { angle: number; dist: number; speed: number; size: number };
type Orbiter = { angle: number; radius: number; speed: number; size: number };
type Column = { x: number; y: number; speed: number; chars: string[] };

const HEX = "0123456789ABCDEF";
const randHex = () => HEX[Math.floor(Math.random() * 16)] + HEX[Math.floor(Math.random() * 16)];

export function DataField({ mode, tone }: { mode: RingMode; tone: RingTone }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const state = useRef({ mode, tone });
  useEffect(() => {
    state.current = { mode, tone };
  }, [mode, tone]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let w = 0;
    let h = 0;
    let dpr = 1;
    const particles: Particle[] = [];
    const orbiters: Orbiter[] = [];
    let columns: Column[] = [];

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas!.clientWidth;
      h = canvas!.clientHeight;
      canvas!.width = w * dpr;
      canvas!.height = h * dpr;
      ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
      // 端の 16 進数の列（左右に数本ずつ）
      const n = Math.max(2, Math.floor(w / 220));
      columns = Array.from({ length: n * 2 }, (_, i) => ({
        x: i < n ? 16 + i * 22 : w - 16 - (i - n) * 22,
        y: Math.random() * h,
        speed: 0.15 + Math.random() * 0.35,
        chars: Array.from({ length: 28 }, randHex),
      }));
    }
    resize();
    window.addEventListener("resize", resize);

    const R = () => Math.min(w, h) * 0.2; // 球体の半径の目安
    for (let i = 0; i < 90; i++)
      particles.push({ angle: Math.random() * Math.PI * 2, dist: Math.random(), speed: 0.002 + Math.random() * 0.004, size: Math.random() * 1.6 + 0.4 });
    for (let i = 0; i < 26; i++)
      orbiters.push({ angle: Math.random() * Math.PI * 2, radius: 1.15 + Math.random() * 0.9, speed: (Math.random() < 0.5 ? -1 : 1) * (0.002 + Math.random() * 0.006), size: Math.random() * 1.8 + 0.6 });

    let t = 0;
    let level = 0; // 動きの強さ（滑らかに変える）
    let raf = 0;

    function frame() {
      const { mode, tone } = state.current;
      const rgb = TONE_RGB[tone];
      const target = tone === "offline" ? 0.15 : mode === "thinking" ? 1 : mode === "speaking" ? 0.85 : mode === "listening" ? 0.7 : 0.35;
      level += (target - level) * 0.04;
      t += 1;

      ctx!.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const r = R();
      const maxDist = Math.hypot(w, h) / 2;

      // 端の 16 進数の列
      ctx!.font = "11px ui-monospace, monospace";
      for (const col of columns) {
        col.y += col.speed * (0.5 + level);
        if (col.y > h + 28 * 14) col.y = -28 * 14;
        col.chars.forEach((c, i) => {
          if (Math.random() < 0.004) col.chars[i] = randHex();
          const y = col.y + i * 14;
          if (y < 0 || y > h) return;
          // 下の 3 割（日時・天気の文字がある所）では薄くする
          const fade = y > h * 0.7 ? Math.max(0, 1 - (y - h * 0.7) / (h * 0.15)) : 1;
          ctx!.fillStyle = `rgba(${rgb},${((0.05 + (i / col.chars.length) * 0.18) * fade).toFixed(3)})`;
          ctx!.fillText(c, col.x, y);
        });
      }

      // 外から中心へ流れ込む光の粒
      for (const p of particles) {
        p.dist -= p.speed * (0.4 + level * 1.6);
        if (p.dist < 0.02) {
          p.dist = 1;
          p.angle = Math.random() * Math.PI * 2;
        }
        const d = r * 1.05 + p.dist * (maxDist - r);
        const x = cx + Math.cos(p.angle) * d;
        const y = cy + Math.sin(p.angle) * d;
        const a = (1 - p.dist) * 0.7 * (0.4 + level);
        ctx!.fillStyle = `rgba(${rgb},${a.toFixed(3)})`;
        ctx!.fillRect(x, y, p.size, p.size);
      }

      // 球体の周りを回る粒
      for (const o of orbiters) {
        o.angle += o.speed * (0.6 + level * 2);
        const x = cx + Math.cos(o.angle) * r * o.radius;
        const y = cy + Math.sin(o.angle) * r * o.radius * 0.98;
        ctx!.beginPath();
        ctx!.arc(x, y, o.size, 0, Math.PI * 2);
        ctx!.fillStyle = `rgba(${rgb},${(0.35 + level * 0.5).toFixed(3)})`;
        ctx!.fill();
      }

      // 波形のリング（考え中・話し中は大きく揺れる）
      ctx!.beginPath();
      const amp = 2 + level * 10;
      for (let i = 0; i <= 180; i++) {
        const ang = (i / 180) * Math.PI * 2;
        const wave = Math.sin(ang * 6 + t * 0.05) * Math.sin(ang * 3 - t * 0.03) * amp + Math.sin(ang * 17 + t * 0.12) * amp * 0.3;
        const rr = r * 1.02 + wave;
        const x = cx + Math.cos(ang) * rr;
        const y = cy + Math.sin(ang) * rr;
        if (i === 0) ctx!.moveTo(x, y);
        else ctx!.lineTo(x, y);
      }
      ctx!.strokeStyle = `rgba(${rgb},${(0.25 + level * 0.5).toFixed(3)})`;
      ctx!.lineWidth = 1.2;
      ctx!.stroke();

      // 走査線（ゆっくり回る扇形の光）
      const sweep = (t * 0.008) % (Math.PI * 2);
      const g = ctx!.createRadialGradient(cx, cy, r * 1.1, cx, cy, maxDist * 0.9);
      g.addColorStop(0, `rgba(${rgb},${(0.025 + level * 0.035).toFixed(3)})`);
      g.addColorStop(1, `rgba(${rgb},0)`);
      ctx!.beginPath();
      ctx!.moveTo(cx, cy);
      ctx!.arc(cx, cy, maxDist * 0.9, sweep, sweep + 0.35);
      ctx!.closePath();
      ctx!.fillStyle = g;
      ctx!.fill();

      if (!reduce) raf = requestAnimationFrame(frame);
    }
    frame();

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
    };
  }, []);

  return <canvas ref={ref} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />;
}
