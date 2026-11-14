// 全画面で使うアイコン（線で描いたもの）。文字の代わりに使う。

type P = { className?: string };
const base = {
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export const MicIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <rect x="9" y="3" width="6" height="11" rx="3" />
    <path d="M5 11a7 7 0 0 0 14 0M12 18v3M9 21h6" />
  </svg>
);
export const StopIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <rect x="7" y="7" width="10" height="10" rx="1.5" />
  </svg>
);
export const ChatIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <path d="M4 5h16v11H9l-5 4z" />
    <path d="M8 9h8M8 12h5" />
  </svg>
);
export const MemoryIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
    <rect x="9.5" y="9.5" width="5" height="5" rx="0.5" />
    <path d="M9 3v3M15 3v3M9 18v3M15 18v3M3 9h3M3 15h3M18 9h3M18 15h3" />
  </svg>
);
export const BookmarkIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <path d="M6 3h12v18l-6-4-6 4z" />
    <path d="M12 7l1 2.2 2.3.3-1.7 1.6.4 2.3-2-1.1-2 1.1.4-2.3-1.7-1.6 2.3-.3z" />
  </svg>
);
export const ExpandIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
  </svg>
);
export const ShrinkIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
  </svg>
);
export const GearIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M5.3 18.7l2.1-2.1M16.6 7.4l2.1-2.1" />
  </svg>
);
export const CloseIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);
export const SpeakerIcon = ({ className, off }: P & { off?: boolean }) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <path d="M4 10v4h4l5 4V6L8 10z" />
    {off ? <path d="M17 9l5 6M22 9l-5 6" /> : <path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12" />}
  </svg>
);
export const PcIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <rect x="3" y="4" width="18" height="12" rx="1.5" />
    <path d="M9 20h6M12 16v4" />
  </svg>
);

/** 天気のアイコン（WMO の天気コードから選ぶ） */
export function WeatherIcon({ code, className }: P & { code: number }) {
  const sun = (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2.5M12 19v2.5M2.5 12H5M19 12h2.5M5.3 5.3l1.8 1.8M16.9 16.9l1.8 1.8M5.3 18.7l1.8-1.8M16.9 7.1l1.8-1.8" />
    </>
  );
  const cloud = <path d="M7 18h10a4 4 0 0 0 .4-8 6 6 0 0 0-11.5 1.5A3.3 3.3 0 0 0 7 18z" />;
  let body;
  if (code <= 1) body = sun;
  else if (code === 2)
    body = (
      <>
        <circle cx="9" cy="9" r="3" />
        <path d="M9 3.5V5M3.5 9H5M5 5l1 1" />
        <path d="M9 19h8a3.5 3.5 0 0 0 .3-7 5 5 0 0 0-9.4 1.3A2.9 2.9 0 0 0 9 19z" />
      </>
    );
  else if (code === 3 || code === 45 || code === 48) body = cloud;
  else if ((code >= 71 && code <= 77) || code === 85 || code === 86)
    body = (
      <>
        {cloud}
        <path d="M9 21h.01M12 21h.01M15 21h.01" />
      </>
    );
  else if (code >= 95)
    body = (
      <>
        {cloud}
        <path d="M12 15l-2 4h3l-2 4" />
      </>
    );
  else
    body = (
      <>
        {cloud}
        <path d="M9 20l-1 2M13 20l-1 2M17 20l-1 2" />
      </>
    );
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      {body}
    </svg>
  );
}

// 小窓の操作
export const ExternalIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
  </svg>
);
export const ReloadIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />
  </svg>
);
export const MaxIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <rect x="4" y="4" width="16" height="16" rx="1.5" />
  </svg>
);
export const RestoreIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <rect x="4" y="8" width="12" height="12" rx="1.5" />
    <path d="M8 8V5a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1h-3" />
  </svg>
);

// アプリのアイコン
export function AppIcon({ id, className }: P & { id: string }) {
  let body;
  switch (id) {
    case "fx": // 線のチャート
      body = <path d="M3 18l5-6 4 3 5-8 4 4M3 21h18" />;
      break;
    case "kabu": // ローソク足
      body = (
        <>
          <path d="M7 3v4M7 15v6M17 5v3M17 17v4" />
          <rect x="5" y="7" width="4" height="8" rx="0.5" />
          <rect x="15" y="8" width="4" height="9" rx="0.5" />
        </>
      );
      break;
    case "umsheet": // 表
      body = (
        <>
          <rect x="3" y="4" width="18" height="16" rx="1.5" />
          <path d="M3 9h18M3 14h18M9 4v16M15 4v16" />
        </>
      );
      break;
    case "keiba": // 蹄鉄
      body = <path d="M7 20H5c-1.5-3-2-6-1.5-9C4.3 6.6 7.8 4 12 4s7.7 2.6 8.5 7c.5 3 0 6-1.5 9h-2c1.3-3 1.6-5.6 1.1-8C17.4 8.6 15 7 12 7S6.6 8.6 5.9 12C5.4 14.4 5.7 17 7 20z" />;
      break;
    case "medical": // 十字
      body = (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7.5v9M7.5 12h9" />
        </>
      );
      break;
    case "nencho": // 書類
      body = (
        <>
          <path d="M6 3h9l4 4v14H6z" />
          <path d="M15 3v4h4M9 12h7M9 16h5" />
        </>
      );
      break;
    default:
      body = <circle cx="12" cy="12" r="8" />;
  }
  return (
    <svg viewBox="0 0 24 24" className={className} {...base}>
      {body}
    </svg>
  );
}

/** 呼びかけ（「ディミ」）を待つ */
export const WakeIcon = ({ className, off }: P & { off?: boolean }) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <path d="M8 18.5c1.5 1.8 4.5 1.8 5.5-.5.7-1.6 2.5-2.5 3.3-4.3A6.5 6.5 0 1 0 5.5 9.5" />
    <path d="M9 10a3 3 0 0 1 6 0c0 1.5-1.5 2-2 3" />
    {off && <path d="M3 3l18 18" />}
  </svg>
);

/** 固定ウィンドウ（ピン） */
export const PinIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <path d="M9 3h6l-1 6 4 4H6l4-4z" />
    <path d="M12 13v8" />
  </svg>
);
/** パレット（ほかのモニターに置く画面） */
export const PaletteIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <rect x="2.5" y="5" width="9" height="7" rx="1" />
    <rect x="12.5" y="5" width="9" height="7" rx="1" />
    <rect x="2.5" y="13" width="9" height="6" rx="1" />
    <rect x="12.5" y="13" width="9" height="6" rx="1" />
  </svg>
);
/** 鍵（位置を固定） */
export const LockIcon = ({ className, open }: P & { open?: boolean }) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <rect x="5" y="11" width="14" height="9" rx="1.5" />
    <path d={open ? "M8 11V8a4 4 0 0 1 7.5-2" : "M8 11V8a4 4 0 0 1 8 0v3"} />
  </svg>
);
/** 送る（別の置き場所へ） */
export const SendIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <path d="M4 12h13M12 6l6 6-6 6M20 4v16" />
  </svg>
);
/** 画面を映す（映像） */
export const CaptureIcon = ({ className }: P) => (
  <svg viewBox="0 0 24 24" className={className} {...base}>
    <rect x="3" y="5" width="18" height="12" rx="1.5" />
    <circle cx="12" cy="11" r="2.5" />
    <path d="M8 21h8" />
  </svg>
);
