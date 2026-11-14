// キーミスの中心のリング（オリジナルのデザイン）。
// 名前の 5 文字（K・Y・M・I・S＝家族 4 人と姓）にちなんで、5 つに区切ったリングを中心に置く。
// - いつもゆっくり回る。考え中は速く回り、話し中は中心が脈打ち、聞き取り中は外側が明るくなる。
// - 状態で色が変わる（通常: 水色 / 注意: 琥珀色 / PC がオフライン: 灰色）。

export type RingMode = "idle" | "thinking" | "speaking" | "listening";
export type RingTone = "normal" | "warn" | "offline";

const C = 200; // 中心の座標（viewBox は 400 × 400）
const LETTERS = ["K", "Y", "M", "I", "S"];

const COLORS: Record<RingTone, { main: string; soft: string; glow: string }> = {
  normal: { main: "#22d3ee", soft: "#0e7490", glow: "rgba(34,211,238,0.55)" },
  warn: { main: "#fbbf24", soft: "#b45309", glow: "rgba(251,191,36,0.5)" },
  offline: { main: "#94a3b8", soft: "#475569", glow: "rgba(148,163,184,0.25)" },
};

function point(r: number, deg: number) {
  const rad = ((deg - 90) * Math.PI) / 180;
  return { x: C + r * Math.cos(rad), y: C + r * Math.sin(rad) };
}

/** 中心から半径 r の円弧（start〜end 度。上が 0 度、時計回り）。 */
function arc(r: number, start: number, end: number) {
  const a = point(r, start);
  const b = point(r, end);
  const large = end - start > 180 ? 1 : 0;
  return `M ${a.x} ${a.y} A ${r} ${r} 0 ${large} 1 ${b.x} ${b.y}`;
}

export function Ring({ mode, tone }: { mode: RingMode; tone: RingTone }) {
  const col = COLORS[tone];
  const fast = mode === "thinking";
  // 回る速さ（秒で 1 周）
  const spin = (idle: number, busy: number) => ({ animationDuration: `${fast ? busy : idle}s` });

  return (
    <svg viewBox="0 0 400 400" className="h-full w-full" role="img" aria-label={`K.Y.M.I.S（${modeLabel(mode, tone)}）`}>
      <defs>
        <radialGradient id="kymis-core" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={col.main} stopOpacity="0.55" />
          <stop offset="60%" stopColor={col.main} stopOpacity="0.12" />
          <stop offset="100%" stopColor={col.main} stopOpacity="0" />
        </radialGradient>
        <radialGradient id="kymis-sphere" cx="45%" cy="40%" r="60%">
          <stop offset="0%" stopColor="#ecfeff" stopOpacity="0.95" />
          <stop offset="35%" stopColor={col.main} stopOpacity="0.85" />
          <stop offset="80%" stopColor={col.soft} stopOpacity="0.55" />
          <stop offset="100%" stopColor="#020617" stopOpacity="0.2" />
        </radialGradient>
        <filter id="kymis-glow" x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* いちばん外側：目盛り（ゆっくり回る） */}
      <g className="kymis-spin" style={{ ...spin(140, 30), transformOrigin: `${C}px ${C}px` }}>
        {Array.from({ length: 120 }, (_, i) => {
          const long = i % 10 === 0;
          const a = point(190, i * 3);
          const b = point(long ? 176 : 183, i * 3);
          return <line key={i} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={col.soft} strokeWidth={long ? 2 : 1} />;
        })}
      </g>
      <circle
        cx={C}
        cy={C}
        r={170}
        fill="none"
        stroke={col.main}
        strokeOpacity={mode === "listening" ? 0.9 : 0.3}
        strokeWidth={mode === "listening" ? 2.5 : 1}
        className={mode === "listening" ? "kymis-breathe" : undefined}
      />

      {/* 5 つに区切ったリングと、名前の 5 文字（K・Y・M・I・S） */}
      <g className="kymis-spin" style={{ ...spin(80, 10), transformOrigin: `${C}px ${C}px` }} filter="url(#kymis-glow)">
        {LETTERS.map((letter, i) => {
          const start = i * 72 + 4;
          const end = i * 72 + 68;
          const mid = point(150, i * 72 + 36);
          return (
            <g key={letter}>
              <path d={arc(150, start, end)} fill="none" stroke={col.main} strokeWidth={16} strokeOpacity={0.85} />
              <text
                x={mid.x}
                y={mid.y}
                fill="#020617"
                fontSize={13}
                fontWeight={700}
                textAnchor="middle"
                dominantBaseline="central"
                transform={`rotate(${i * 72 + 36} ${mid.x} ${mid.y})`}
              >
                {letter}
              </text>
            </g>
          );
        })}
      </g>

      {/* 内側：点線のリング（逆回り） */}
      <g className="kymis-spin-reverse" style={{ ...spin(60, 8), transformOrigin: `${C}px ${C}px` }}>
        <circle cx={C} cy={C} r={124} fill="none" stroke={col.main} strokeOpacity={0.6} strokeWidth={3} strokeDasharray="2 10" />
      </g>

      {/* 内側：2 本の弧（考え中は速く回る） */}
      <g className="kymis-spin" style={{ ...spin(24, 2.5), transformOrigin: `${C}px ${C}px` }}>
        <path d={arc(106, 20, 140)} fill="none" stroke={col.main} strokeWidth={3} strokeLinecap="round" />
        <path d={arc(106, 200, 290)} fill="none" stroke={col.soft} strokeWidth={3} strokeLinecap="round" />
      </g>

      {/* 中心：光る球体（話し中は脈打ち、待機中は静かに息づく） */}
      <g className={mode === "speaking" ? "kymis-pulse" : "kymis-breathe"} style={{ transformOrigin: `${C}px ${C}px` }}>
        <circle cx={C} cy={C} r={96} fill="url(#kymis-core)" />
        <circle cx={C} cy={C} r={62} fill="url(#kymis-sphere)" filter="url(#kymis-glow)" />
        <ellipse cx={C - 18} cy={C - 22} rx={20} ry={12} fill="#ffffff" fillOpacity={0.18} />
        <circle cx={C} cy={C} r={62} fill="none" stroke={col.main} strokeOpacity={0.7} />
      </g>
      <text
        x={C}
        y={C + 84}
        fill={col.main}
        fillOpacity={0.8}
        fontSize={11}
        letterSpacing={5}
        textAnchor="middle"
        dominantBaseline="central"
      >
        K.Y.M.I.S
      </text>
    </svg>
  );
}

export function modeLabel(mode: RingMode, tone: RingTone) {
  if (tone === "offline") return "PC オフライン";
  if (mode === "listening") return "聞いています";
  if (mode === "thinking") return "考えています";
  if (mode === "speaking") return "話しています";
  return "待機中";
}
