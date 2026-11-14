"use client";

// キーミスの全画面（デスクトップ PC の画面に出しっぱなしにする用）。
// 中心にリング、左にアプリの状況、右に日時・天気・PC の状態。下で声で話しかけられる。

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Message } from "@/lib/types";
import { takeSpeakable } from "@/lib/speech";
import { fetchWeather, findPlace, weatherLabel, type Place, type Weather } from "@/lib/weather";
import { useAgentOnline } from "@/hooks/useAgentOnline";
import { useSpeaker } from "@/hooks/useSpeaker";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { Ring, type RingMode, type RingTone } from "./Ring";

const PLACE_KEY = "kymis.weatherPlace";

function loadPlace(): Place | null {
  try {
    const v = localStorage.getItem(PLACE_KEY);
    return v ? (JSON.parse(v) as Place) : null;
  } catch {
    return null;
  }
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-cyan-500/30 bg-slate-950/70 p-4 shadow-[0_0_24px_rgba(34,211,238,0.08)]">
      <h2 className="mb-3 text-xs font-semibold tracking-[0.3em] text-cyan-400">{title}</h2>
      {children}
    </section>
  );
}

function Clock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  if (!now) return null;
  const date = now.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", year: "numeric", month: "long", day: "numeric", weekday: "short" });
  const time = now.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit", second: "2-digit" });
  return (
    <div>
      <div className="font-mono text-4xl tracking-widest text-cyan-200">{time}</div>
      <div className="mt-1 text-sm text-cyan-400/80">{date}</div>
    </div>
  );
}

function WeatherPanel() {
  const [place, setPlace] = useState<Place | null>(null);
  const [weather, setWeather] = useState<Weather | null>(null);
  const [input, setInput] = useState("");
  const [editing, setEditing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const p = loadPlace();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 保存した地域はブラウザでしか読めないため
    setPlace(p);
    if (!p) setEditing(true);
  }, []);

  useEffect(() => {
    if (!place) return;
    let cancelled = false;
    const load = () =>
      fetchWeather(place)
        .then((w) => !cancelled && (setWeather(w), setError("")))
        .catch((e) => !cancelled && setError(e.message));
    load();
    const t = setInterval(load, 30 * 60 * 1000); // 30 分ごと
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [place]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim()) return;
    setError("");
    try {
      const p = await findPlace(input.trim());
      if (!p) return setError("その地名が見つかりませんでした。市区町村の名前で入れてください。");
      try {
        localStorage.setItem(PLACE_KEY, JSON.stringify(p));
      } catch {}
      setPlace(p);
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <Panel title="WEATHER  天気">
      {editing ? (
        <form onSubmit={save} className="flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="地域（例: 横浜市）"
            className="min-w-0 flex-1 rounded border border-cyan-700/60 bg-slate-900 px-2 py-1 text-sm"
          />
          <button className="rounded bg-cyan-700 px-3 py-1 text-sm text-white">設定</button>
        </form>
      ) : weather ? (
        <div>
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-3xl text-cyan-200">{Math.round(weather.temperature)}℃</span>
            <span className="text-cyan-300">{weatherLabel(weather.code)}</span>
          </div>
          <div className="mt-1 text-sm text-cyan-400/80">
            最高 {Math.round(weather.max)}℃ / 最低 {Math.round(weather.min)}℃
            {weather.rain !== null && ` / 降水 ${weather.rain}%`}
          </div>
          <button onClick={() => setEditing(true)} className="mt-2 text-xs text-slate-500 underline">
            {place?.name}（変更）
          </button>
        </div>
      ) : (
        <p className="text-sm text-slate-400">読み込み中…</p>
      )}
      {error && <p className="mt-2 text-xs text-red-400">{error}</p>}
    </Panel>
  );
}

export function Hud({ supabase }: { supabase: SupabaseClient }) {
  const online = useAgentOnline(supabase);
  const [messages, setMessages] = useState<Message[]>([]);
  const [error, setError] = useState("");
  const [fullscreen, setFullscreen] = useState(false);
  const liveIds = useRef(new Set<string>());
  const spokenUpTo = useRef(new Map<string, number>());

  // 会話：直近の分を読み、変化を Realtime で受け取る
  useEffect(() => {
    let cancelled = false;
    supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(10)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(`会話を読み込めませんでした: ${error.message}`);
        else setMessages((data as Message[]).reverse());
      });
    const channel = supabase
      .channel("hud-messages")
      .on("postgres_changes", { event: "*", schema: "public", table: "messages" }, (payload) => {
        if (payload.eventType === "INSERT" && (payload.new as Message).role === "assistant") {
          liveIds.current.add((payload.new as Message).id);
        }
        setMessages((prev) => {
          if (payload.eventType === "DELETE") return prev.filter((m) => m.id !== (payload.old as Message).id);
          const row = payload.new as Message;
          const i = prev.findIndex((m) => m.id === row.id);
          if (i === -1) return [...prev, row].slice(-10);
          const next = prev.slice();
          next[i] = row;
          return next;
        });
      })
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  const speaker = useSpeaker(() => {});
  const { speak, cancel: cancelSpeech } = speaker;

  const recognition = useSpeechRecognition(
    useCallback(
      async (text: string) => {
        setError("");
        const { error } = await supabase.from("messages").insert({ role: "user", content: text });
        if (error) setError(`送信できませんでした: ${error.message}`);
      },
      [supabase],
    ),
  );

  // 返事を 1 文書き終わるごとに読み上げる（この画面を開いてから届いた返事だけ）
  useEffect(() => {
    for (const m of messages) {
      if (m.role !== "assistant" || !liveIds.current.has(m.id)) continue;
      const final = m.status !== "processing";
      const { chunk, next } = takeSpeakable(m.content, spokenUpTo.current.get(m.id) ?? 0, final);
      spokenUpTo.current.set(m.id, next);
      if (chunk) speak(chunk);
      if (final) liveIds.current.delete(m.id);
    }
  }, [messages, speak]);

  // 画面を消さない（ずっと表示しておくため）。対応していないブラウザでは何もしない。
  useEffect(() => {
    let lock: { release: () => Promise<void> } | null = null;
    const request = async () => {
      try {
        const nav = navigator as unknown as { wakeLock?: { request: (t: "screen") => Promise<typeof lock> } };
        if (document.visibilityState === "visible" && nav.wakeLock) lock = await nav.wakeLock.request("screen");
      } catch {}
    };
    request();
    document.addEventListener("visibilitychange", request);
    const onFs = () => setFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => {
      document.removeEventListener("visibilitychange", request);
      document.removeEventListener("fullscreenchange", onFs);
      lock?.release().catch(() => {});
    };
  }, []);

  const waiting = messages.some(
    (m) => (m.role === "user" && (m.status === "pending" || m.status === "processing")) || (m.role === "assistant" && m.status === "processing"),
  );
  const mode: RingMode = recognition.listening ? "listening" : speaker.speaking ? "speaking" : waiting ? "thinking" : "idle";
  const tone: RingTone = online === false ? "offline" : "normal";

  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  const lastReply = [...messages].reverse().find((m) => m.role === "assistant");
  const lastReplyAt = lastReply ? new Date(lastReply.created_at).toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" }) : null;

  function onMic() {
    if (recognition.listening) return recognition.stop();
    cancelSpeech();
    recognition.start();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  return (
    <div className="kymis-grid flex min-h-dvh flex-col text-slate-100">
      <header className="flex items-center justify-between px-6 py-4 text-xs tracking-[0.3em] text-cyan-400/80">
        <span>K.Y.M.I.S // キーミス</span>
        <div className="flex items-center gap-4 tracking-normal">
          <Link href="/" className="underline hover:text-cyan-200">
            チャット
          </Link>
          <button onClick={toggleFullscreen} className="underline hover:text-cyan-200">
            {fullscreen ? "全画面をやめる" : "全画面"}
          </button>
        </div>
      </header>

      <main className="grid flex-1 grid-cols-1 items-center gap-6 px-6 pb-6 lg:grid-cols-[1fr_minmax(320px,560px)_1fr]">
        {/* 左：アプリの状況 */}
        <div className="order-2 space-y-4 lg:order-1">
          <Panel title="APPS  アプリの状況">
            <p className="text-sm text-slate-400">
              アプリの見張りは準備中です（次の作業で、自動テスト・公開・画面が開けるかを、ここに一覧で出します）。
            </p>
            <p className="mt-2 text-sm text-slate-400">今は、声や文字で「FX の状況は？」などと聞いてください。</p>
          </Panel>
        </div>

        {/* 中央：リング */}
        <div className="order-1 flex flex-col items-center lg:order-2">
          <div className="aspect-square w-full max-w-[560px]">
            <Ring mode={mode} tone={tone} />
          </div>
          <div className="mt-2 min-h-[4.5rem] w-full max-w-[560px] text-center">
            {recognition.listening ? (
              <p className="text-lg text-cyan-200">{recognition.interim || "どうぞ、お話しください"}</p>
            ) : lastReply ? (
              <p className="line-clamp-3 text-base text-cyan-100/90">{lastReply.content}</p>
            ) : null}
          </div>
          <div className="mt-2 flex items-center gap-3">
            {recognition.supported ? (
              <button
                onClick={onMic}
                className={
                  "rounded-full border px-6 py-2 text-sm tracking-widest " +
                  (recognition.listening ? "animate-pulse border-red-400 text-red-300" : "border-cyan-400/60 text-cyan-200 hover:bg-cyan-500/10")
                }
              >
                {recognition.listening ? "■ 聞き取りをやめる" : "🎤 話しかける"}
              </button>
            ) : (
              <span className="text-xs text-slate-500">このブラウザは音声入力に対応していません（Chrome / Edge で開いてください）</span>
            )}
          </div>
          {(error || recognition.error) && <p className="mt-2 text-sm text-red-400">{error || recognition.error}</p>}
        </div>

        {/* 右：日時・天気・PC の状態 */}
        <div className="order-3 space-y-4">
          <Panel title="TIME  日時">
            <Clock />
          </Panel>
          <WeatherPanel />
          <Panel title="SYSTEM  PC の状態">
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-400">PC</dt>
                <dd className={online ? "text-emerald-300" : online === false ? "text-slate-400" : "text-amber-300"}>
                  {online ? "オンライン" : online === false ? "オフライン" : "確認中"}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-400">最後の返事</dt>
                <dd className="text-cyan-200">{lastReplyAt ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="shrink-0 text-slate-400">最後の発言</dt>
                <dd className="truncate text-cyan-200">{lastUser?.content ?? "—"}</dd>
              </div>
            </dl>
            <p className="mt-2 text-xs text-slate-500">Claude の利用枠の残りは、Claude アプリの「使用量」で確認できます（ここには出せません）。</p>
          </Panel>
        </div>
      </main>
    </div>
  );
}
