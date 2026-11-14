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
