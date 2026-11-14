"use client";

// 設定の画面。項目をカテゴリーごとのタブに分ける。設定はこの端末のブラウザに保存する。
// - 音声: 読み上げ、声の大きさ、声、話す速さ、声の高さ
// - 聞き取り: 話し終わりを待つ時間、「ディミ」の呼びかけ、続けて話せる時間、右 Ctrl を 2 回
// - 表示: 天気の地域、字幕を出しておく時間
// - アカウント: ディミの外（Chrome）で開くときのアカウント（Chrome のプロフィール）

import { useEffect, useState } from "react";
import type { Place } from "@/lib/weather";
import type { ChromeProfile } from "@/lib/pc";
import { DEFAULT_PITCH, DEFAULT_RATE, DEFAULT_VOLUME } from "@/hooks/useSpeaker";
import { CloseIcon } from "./Icons";

type Tab = "voice" | "wake" | "display" | "account";
const TABS: { id: Tab; label: string }[] = [
  { id: "voice", label: "音声" },
  { id: "wake", label: "聞き取り" },
  { id: "display", label: "表示" },
  { id: "account", label: "アカウント" },
];
const TAB_KEY = "dimy.settingsTab";

export type SettingsProps = {
  onClose: () => void;
  // 音声
  speakOn: boolean;
  setSpeakOn: (v: boolean) => void;
  voices: SpeechSynthesisVoice[];
  voiceName: string | null;
  setVoiceName: (name: string) => void;
  rate: number;
  setRate: (v: number) => void;
  volume: number;
  setVolume: (v: number) => void;
  pitch: number;
  setPitch: (v: number) => void;
  onTestVoice: () => void;
  // 呼びかけ
  wakeSupported: boolean;
  wakeStatus: string; // 確かめる用: 聞き取りの状態
  wakeLastHeard: string; // 確かめる用: 最後に聞こえた言葉
  wakeOn: boolean;
  setWakeOn: (v: boolean) => void;
  silenceSec: number;
  setSilenceSec: (v: number) => void;
  followSec: number;
  setFollowSec: (v: number) => void;
  hotkeyOn: boolean;
  setHotkeyOn: (v: boolean) => void;
  // アカウント
  profiles: ChromeProfile[] | null;
  defaultAccount: number;
  setDefaultAccount: (n: number) => void;
  onRefreshProfiles: () => void;
  // 表示
  place: Place | null;
  onSavePlace: (name: string) => Promise<string | null>; // 失敗したときは理由を返す
  captionSec: number;
  setCaptionSec: (v: number) => void;
};

export function Settings(p: SettingsProps) {
  const [tab, setTab] = useState<Tab>("voice");
  useEffect(() => {
    try {
      const t = localStorage.getItem(TAB_KEY) as Tab | null;
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (t && TABS.some((x) => x.id === t)) setTab(t);
    } catch {}
  }, []);
  const choose = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem(TAB_KEY, t);
    } catch {}
  };

  // Esc で閉じる
  const { onClose } = p;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-[950] grid place-items-center bg-slate-950/60 p-4 backdrop-blur-sm" onClick={p.onClose}>
      <div
        role="dialog"
        aria-label="設定"
        onClick={(e) => e.stopPropagation()}
        className="dimy-fade-in flex max-h-[min(640px,calc(100dvh-2rem))] w-[560px] max-w-full flex-col rounded-lg border border-cyan-400/35 bg-slate-950/95 text-sm shadow-[0_0_40px_rgba(34,211,238,0.15)]"
      >
        <div className="flex items-center justify-between border-b border-cyan-400/20 px-5 py-3">
          <h2 className="font-mono text-xs tracking-[0.3em] text-cyan-300">SETTINGS</h2>
          <button onClick={p.onClose} aria-label="閉じる" className="text-cyan-400 hover:text-cyan-100">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div role="tablist" className="flex gap-1 border-b border-cyan-400/20 px-3">
          {TABS.map((t) => (
            <button
              key={t.id}
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => choose(t.id)}
              className={
                "-mb-px border-b-2 px-4 py-2.5 transition " +
                (tab === t.id ? "border-cyan-300 text-cyan-100" : "border-transparent text-slate-400 hover:text-cyan-200")
              }
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
          {tab === "voice" && <VoiceTab {...p} />}
          {tab === "wake" && <WakeTab {...p} />}
          {tab === "display" && <DisplayTab {...p} />}
          {tab === "account" && <AccountTab {...p} />}
        </div>
      </div>
    </div>
  );
}

function VoiceTab(p: SettingsProps) {
  return (
    <>
      <Toggle label="返事を読み上げる" checked={p.speakOn} onChange={p.setSpeakOn} />
      <Slider
        label="ディミの声の大きさ"
        value={p.volume}
        min={0}
        max={1}
        step={0.05}
        onChange={p.setVolume}
        def={DEFAULT_VOLUME}
        format={(v) => `${Math.round(v * 100)}%`}
        note="PC 全体の音量とは別の設定です。ほかのアプリの音は変わりません。PC の音量より大きくはできないので、最大でも小さいときは PC の音量を上げてください。"
      />
      {p.voices.length > 0 && (
        <Row label="声">
          <select
            value={p.voiceName ?? ""}
            onChange={(e) => p.setVoiceName(e.target.value)}
            className="w-full rounded border border-cyan-700/60 bg-slate-900 px-2 py-1.5"
          >
            {p.voices.map((v) => (
              <option key={v.name} value={v.name}>
                {v.name}
              </option>
            ))}
          </select>
        </Row>
      )}
      <Slider label="話す速さ" value={p.rate} min={0.7} max={1.6} step={0.05} onChange={p.setRate} def={DEFAULT_RATE} format={(v) => `${v.toFixed(2)} 倍`} />
      <Slider label="声の高さ" value={p.pitch} min={0.7} max={1.4} step={0.05} onChange={p.setPitch} def={DEFAULT_PITCH} format={(v) => v.toFixed(2)} />
      <button onClick={p.onTestVoice} className="rounded border border-cyan-500/50 px-4 py-1.5 text-cyan-200 hover:bg-cyan-400/10">
        試しに聞く
      </button>
    </>
  );
}

function WakeTab(p: SettingsProps) {
  return (
    <>
      <Slider
        label="話し終わりを待つ時間"
        value={p.silenceSec}
        min={0.5}
        max={3}
        step={0.1}
        onChange={p.setSilenceSec}
        def={1.5}
        format={(v) => `${v.toFixed(1)} 秒`}
        note="話している途中でこの時間だけ黙ると、話し終わったとみなして送ります。考えながら話して途中で途切れるときは長く、返事を早くしたいときは短くしてください。マイクのボタンと「ディミ」の呼びかけの両方に効きます。マイクのボタンや右 Ctrl 2 回で終えたときは、待たずにすぐ送ります。"
      />
      {p.wakeSupported ? (
        <Toggle
          label="「ディミ」の呼びかけを待つ"
          note="この端末だけの設定です。呼ぶと「はい」と答えるので、そのまま話してください。「終わり」で待ち受けに戻り、「聞かないで」でこの設定がオフになります。"
          checked={p.wakeOn}
          onChange={p.setWakeOn}
        />
      ) : (
        <p className="text-slate-400">このブラウザは音声認識に対応していないため、呼びかけは使えません。</p>
      )}
      {p.wakeSupported && p.wakeOn && (
        <div className="rounded border border-cyan-400/20 bg-slate-900/60 p-3 font-mono text-xs">
          <div className="flex gap-2">
            <span className="shrink-0 text-cyan-400/70">状態</span>
            <span className="text-cyan-100">{p.wakeStatus}</span>
          </div>
          <div className="mt-1 flex gap-2">
            <span className="shrink-0 text-cyan-400/70">最後に聞こえた言葉</span>
            <span className="break-all text-cyan-100">{p.wakeLastHeard || "（まだありません）"}</span>
          </div>
          <p className="mt-2 font-sans text-slate-400">「ディミ」と呼んでも反応しないときは、ここに何と聞こえたかを教えてください。聞き間違いの言葉を呼びかけとして足します。</p>
        </div>
      )}
      <Slider
        label="返事のあと、続けて話せる時間"
        value={p.followSec}
        min={0}
        max={20}
        step={1}
        onChange={p.setFollowSec}
        def={8}
        format={(v) => (v === 0 ? "なし" : `${v} 秒`)}
      />
      <Toggle
        label="右 Ctrl を 2 回押して話す"
        note="PC でディミが動いているとき、どの画面が前にあっても使えます。もう一度 2 回押すと、話し終わって送ります。スマホでは反応しません。"
        checked={p.hotkeyOn}
        onChange={p.setHotkeyOn}
      />
    </>
  );
}

function DisplayTab(p: SettingsProps) {
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");
  return (
    <>
      <Row label="天気の地域" note={p.place ? `いまの設定: ${p.place.name}` : "市区町村の名前で入れてください（例: 横浜市）"}>
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (!name.trim()) return;
            const err = await p.onSavePlace(name.trim());
            setMsg(err ?? "保存しました");
            if (!err) setName("");
          }}
          className="flex gap-2"
        >
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={p.place?.name ?? "横浜市"}
            className="min-w-0 flex-1 rounded border border-cyan-700/60 bg-slate-900 px-2 py-1.5"
          />
          <button className="rounded bg-cyan-700 px-3 text-white">保存</button>
        </form>
        {msg && <p className="mt-1 text-xs text-cyan-300/80">{msg}</p>}
      </Row>
      <Slider
        label="返事の字幕を出しておく時間"
        value={p.captionSec}
        min={0}
        max={60}
        step={1}
        onChange={p.setCaptionSec}
        def={12}
        format={(v) => (v === 0 ? "話している間だけ" : `${v} 秒`)}
      />
    </>
  );
}

function AccountTab(p: SettingsProps) {
  return (
    <>
      <p className="text-xs leading-relaxed text-slate-400">
        ディミの外（Chrome）で開くもの（YouTube・Google の検索、ブックマーク、Claude など）は、PC のディミが Chrome で開きます。
        「アカウント2で YouTube で〇〇と検索」のように言うと、2 番目の Chrome のプロフィールで開きます。プロフィールの名前（例: 「個人のアカウントで」）でも呼べます。
      </p>
      {p.profiles === null ? (
        <p className="text-slate-400">PC の情報がまだ届いていません（PC のディミが動いていて、データベースの更新が済んでいれば、数分で出ます）。</p>
      ) : (
        <div className="space-y-1.5">
          {p.profiles.map((pr, i) => (
            <label key={pr.dir} className="flex cursor-pointer items-center gap-3 rounded border border-cyan-400/20 px-3 py-2 hover:bg-cyan-400/5">
              <input
                type="radio"
                name="dimy-account"
                checked={p.defaultAccount === i + 1}
                onChange={() => p.setDefaultAccount(i + 1)}
                className="accent-cyan-400"
              />
              <span className="w-24 shrink-0 font-mono text-xs text-cyan-300">アカウント{i + 1}</span>
              <span className="min-w-0 flex-1 truncate text-cyan-100">{pr.name}</span>
              <span className="truncate text-xs text-slate-400">{pr.email}</span>
            </label>
          ))}
          <p className="text-xs text-slate-400">印を付けたアカウントが、指定しないときのアカウントです。</p>
        </div>
      )}
      <p className="text-xs leading-relaxed text-slate-400">
        アカウントを増やすには、PC の Chrome の右上の人のアイコン →「プロフィールを追加」で、別のアカウントにログインしておいてください。番号は Chrome のプロフィールの並び順です。
      </p>
      <button onClick={p.onRefreshProfiles} className="rounded border border-cyan-500/50 px-4 py-1.5 text-cyan-200 hover:bg-cyan-400/10">
        読み直す
      </button>
    </>
  );
}

function Row({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-cyan-100">{label}</div>
      {children}
      {note && <p className="mt-1 text-xs text-slate-400">{note}</p>}
    </div>
  );
}

function Toggle({ label, note, checked, onChange }: { label: string; note?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <div>
      <label className="flex cursor-pointer items-center justify-between gap-4">
        <span className="text-cyan-100">{label}</span>
        <button
          role="switch"
          aria-checked={checked}
          onClick={() => onChange(!checked)}
          className={
            "relative h-6 w-11 shrink-0 rounded-full border transition " +
            (checked ? "border-cyan-300/80 bg-cyan-500/40 shadow-[0_0_10px_rgba(34,211,238,0.4)]" : "border-slate-600 bg-slate-800")
          }
        >
          <span className={"absolute top-0.5 h-4 w-4 rounded-full bg-cyan-100 transition-all " + (checked ? "left-6" : "left-0.5 bg-slate-400")} />
        </button>
      </label>
      {note && <p className="mt-1 text-xs text-slate-400">{note}</p>}
    </div>
  );
}

function Slider(o: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  def: number;
  onChange: (v: number) => void;
  format: (v: number) => string;
  note?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-cyan-100">{o.label}</span>
        <span className="flex items-center gap-3 font-mono text-xs text-cyan-300">
          {o.format(o.value)}
          {o.value !== o.def && (
            <button onClick={() => o.onChange(o.def)} className="text-slate-400 hover:text-cyan-200">
              元に戻す
            </button>
          )}
        </span>
      </div>
      <input
        type="range"
        min={o.min}
        max={o.max}
        step={o.step}
        value={o.value}
        onChange={(e) => o.onChange(Number(e.target.value))}
        className="w-full accent-cyan-400"
        aria-label={o.label}
      />
      {o.note && <p className="mt-1 text-xs text-slate-400">{o.note}</p>}
    </div>
  );
}
