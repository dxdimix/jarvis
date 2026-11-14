"use client";

// ディミのメイン画面（声が中心）。文字は最小限にし、操作はアイコンだけ。
// - 中央: 光る球体とリング。周りをデータが流れ続ける
// - 下中央: マイク。左下: 日時。右下: 天気。左上: PC の状態
// - 右上のアイコン: 会話（履歴と文字入力のパネル）、覚えていること、読み上げ、設定、全画面

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Message } from "@/lib/types";
import { takeSpeakable } from "@/lib/speech";
import { fetchWeather, findPlace, weatherLabel, type Place, type Weather } from "@/lib/weather";
import { useAgentOnline } from "@/hooks/useAgentOnline";
import { useSpeaker } from "@/hooks/useSpeaker";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { Chat } from "@/components/Chat";
import { Ring, type RingMode, type RingTone } from "./Ring";
import { DataField } from "./DataField";
import {
  ChatIcon,
  CloseIcon,
  ExpandIcon,
  GearIcon,
  MemoryIcon,
  MicIcon,
  PcIcon,
  ShrinkIcon,
  SpeakerIcon,
  StopIcon,
  WeatherIcon,
} from "./Icons";

const PLACE_KEY = "dimy.weatherPlace";
const SPEAK_KEY = "dimy.speak";
const VOICE_KEY = "dimy.voice";
const CAPTION_MS = 12_000; // 返事の字幕を出しておく時間

function load(key: string) {
  try {
    // 以前の名前（kymis.〇〇）で保存した設定も引き継ぐ
    return localStorage.getItem(key) ?? localStorage.getItem(key.replace(/^dimy\./, "kymis."));
  } catch {
    return null;
  }
}
function save(key: string, value: string) {
  try {
    localStorage.setItem(key, value);
  } catch {}
}

const iconBtn =
  "grid h-11 w-11 place-items-center rounded-full border border-cyan-400/25 bg-slate-950/50 text-cyan-300 backdrop-blur transition hover:border-cyan-300/70 hover:text-cyan-100 hover:shadow-[0_0_18px_rgba(34,211,238,0.35)]";

function useNow() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const tick = () => setNow(new Date());
    tick();
    const t = setInterval(tick, 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function useWeather(place: Place | null) {
  const [weather, setWeather] = useState<Weather | null>(null);
  useEffect(() => {
    if (!place) return;
    let cancelled = false;
    const run = () =>
      fetchWeather(place)
        .then((w) => !cancelled && setWeather(w))
        .catch(() => {});
    run();
    const t = setInterval(run, 30 * 60 * 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [place]);
  return weather;
}

export function Hud({ supabase, session }: { supabase: SupabaseClient; session: Session }) {
  const online = useAgentOnline(supabase);
  const now = useNow();
  const [messages, setMessages] = useState<Message[]>([]);
  const [panel, setPanel] = useState<"none" | "chat" | "settings">("none");
  const [fullscreen, setFullscreen] = useState(false);
  const [speakOn, setSpeakOn] = useState(true);
  const [place, setPlace] = useState<Place | null>(null);
  const [placeInput, setPlaceInput] = useState("");
  const [error, setError] = useState("");
  const [captionUntil, setCaptionUntil] = useState(0);
  const weather = useWeather(place);
  const liveIds = useRef(new Set<string>());
  const spokenUpTo = useRef(new Map<string, number>());

  // ブラウザに保存した設定を読む（ブラウザでしか読めないため、表示のあとで）
  useEffect(() => {
    const p = load(PLACE_KEY);
    /* eslint-disable react-hooks/set-state-in-effect */
    if (p) setPlace(JSON.parse(p) as Place);
    setSpeakOn(load(SPEAK_KEY) !== "off");
    /* eslint-enable react-hooks/set-state-in-effect */
  }, []);

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

  const speaker = useSpeaker(() => setCaptionUntil(Date.now() + CAPTION_MS), load(VOICE_KEY));
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
      if (speakOn && chunk) speak(chunk);
      if (final) {
        liveIds.current.delete(m.id);
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 返事が届いた時刻から字幕を出す
        setCaptionUntil(Date.now() + CAPTION_MS);
      }
    }
  }, [messages, speak, speakOn]);

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
    (m) =>
      (m.role === "user" && (m.status === "pending" || m.status === "processing")) ||
      (m.role === "assistant" && m.status === "processing"),
  );
  const mode: RingMode = recognition.listening ? "listening" : speaker.speaking ? "speaking" : waiting ? "thinking" : "idle";
  const tone: RingTone = online === false ? "offline" : "normal";
  const lastReply = [...messages].reverse().find((m) => m.role === "assistant");
  const showCaption =
    recognition.listening || speaker.speaking || (lastReply?.status === "processing") || (now !== null && now.getTime() < captionUntil);
  const caption = recognition.listening ? recognition.interim : lastReply?.content ?? "";

  function onMic() {
    if (recognition.listening) return recognition.stop();
    cancelSpeech();
    recognition.start();
  }

  function toggleSpeak() {
    const next = !speakOn;
    setSpeakOn(next);
    save(SPEAK_KEY, next ? "on" : "off");
    if (!next) cancelSpeech();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  async function savePlace(e: React.FormEvent) {
    e.preventDefault();
    if (!placeInput.trim()) return;
    setError("");
    try {
      const p = await findPlace(placeInput.trim());
      if (!p) return setError("その地名が見つかりませんでした。市区町村の名前で入れてください。");
      save(PLACE_KEY, JSON.stringify(p));
      setPlace(p);
      setPlaceInput("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const time = now?.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });
  const date = now?.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short" });
  const pcLabel = online ? "PC オンライン" : online === false ? "PC オフライン" : "PC 確認中";

  return (
    <div className="dimy-grid relative h-dvh w-full overflow-hidden text-cyan-100">
      <DataField mode={mode} tone={tone} />

      {/* 中央：球体とリング */}
      <div className="absolute inset-0 grid place-items-center">
        <div className="aspect-square w-[min(62vmin,640px)]">
          <Ring mode={mode} tone={tone} />
        </div>
      </div>

      {/* 字幕（話している・聞いている間と、返事のあと少しだけ） */}
      <div
        className={
          "pointer-events-none absolute inset-x-0 bottom-32 mx-auto max-w-2xl px-6 text-center transition-opacity duration-700 " +
          (showCaption && caption ? "opacity-100" : "opacity-0")
        }
      >
        <p className="line-clamp-3 text-base leading-relaxed text-cyan-100/90 drop-shadow-[0_0_8px_rgba(2,6,23,0.9)]">{caption}</p>
      </div>

      {/* 左上：PC の状態 */}
      <div className="absolute left-5 top-5 flex items-center gap-2" title={pcLabel} aria-label={pcLabel}>
        <PcIcon className={"h-6 w-6 " + (online ? "text-cyan-300" : "text-slate-500")} />
        <span
          className={
            "h-2 w-2 rounded-full " + (online ? "bg-emerald-400 shadow-[0_0_8px_#34d399]" : online === false ? "bg-slate-500" : "bg-amber-400")
          }
        />
      </div>

      {/* 右上：アイコン */}
      <nav className="absolute right-5 top-5 flex gap-2">
        <button onClick={() => setPanel(panel === "chat" ? "none" : "chat")} className={iconBtn} title="会話の履歴と文字入力" aria-label="会話の履歴と文字入力">
          <ChatIcon className="h-5 w-5" />
        </button>
        <Link href="/memory" className={iconBtn} title="覚えていること" aria-label="覚えていること">
          <MemoryIcon className="h-5 w-5" />
        </Link>
        <button onClick={toggleSpeak} className={iconBtn} title={speakOn ? "読み上げ オン" : "読み上げ オフ"} aria-label="読み上げの切り替え" aria-pressed={speakOn}>
          <SpeakerIcon className="h-5 w-5" off={!speakOn} />
        </button>
        <button onClick={() => setPanel(panel === "settings" ? "none" : "settings")} className={iconBtn} title="設定" aria-label="設定">
          <GearIcon className="h-5 w-5" />
        </button>
        <button onClick={toggleFullscreen} className={iconBtn} title="全画面" aria-label="全画面の切り替え">
          {fullscreen ? <ShrinkIcon className="h-5 w-5" /> : <ExpandIcon className="h-5 w-5" />}
        </button>
      </nav>

      {/* 左下：日時 */}
      <div className="absolute bottom-6 left-6 font-mono">
        <div className="text-2xl tracking-widest text-cyan-200 sm:text-4xl drop-shadow-[0_0_10px_rgba(34,211,238,0.45)]">{time}</div>
        <div className="mt-1 text-xs tracking-[0.25em] text-cyan-400/70">{date}</div>
      </div>

      {/* 右下：天気 */}
      {weather && (
        <div className="absolute bottom-6 right-6 flex items-center gap-3" title={`${place?.name} ${weatherLabel(weather.code)}`}>
          <WeatherIcon code={weather.code} className="h-10 w-10 text-cyan-300" />
          <div className="font-mono">
            <div className="text-2xl text-cyan-200 sm:text-3xl">{Math.round(weather.temperature)}°</div>
            <div className="text-xs text-cyan-400/70">
              {Math.round(weather.max)}° / {Math.round(weather.min)}°{weather.rain !== null && ` ・${weather.rain}%`}
            </div>
          </div>
        </div>
      )}

      {/* 下中央：マイク */}
      <div className="absolute inset-x-0 bottom-8 flex flex-col items-center">
        {recognition.supported ? (
          <button
            onClick={onMic}
            aria-label={recognition.listening ? "聞き取りをやめる" : "話しかける"}
            className={
              "grid h-16 w-16 place-items-center rounded-full border backdrop-blur transition " +
              (recognition.listening
                ? "animate-pulse border-rose-400 bg-rose-500/20 text-rose-200 shadow-[0_0_28px_rgba(244,63,94,0.5)]"
                : "border-cyan-300/60 bg-cyan-500/10 text-cyan-100 shadow-[0_0_24px_rgba(34,211,238,0.35)] hover:bg-cyan-500/20")
            }
          >
            {recognition.listening ? <StopIcon className="h-7 w-7" /> : <MicIcon className="h-7 w-7" />}
          </button>
        ) : (
          <button onClick={() => setPanel("chat")} className={iconBtn} aria-label="文字で話しかける" title="このブラウザは音声入力に対応していません。文字で話しかけてください">
            <ChatIcon className="h-5 w-5" />
          </button>
        )}
        {(error || recognition.error) && <p className="mt-2 text-xs text-rose-300">{error || recognition.error}</p>}
      </div>

      {/* 設定（天気の地域と声） */}
      {panel === "settings" && (
        <div className="absolute right-5 top-20 w-80 max-w-[calc(100vw-2.5rem)] rounded-lg border border-cyan-400/30 bg-slate-950/90 p-4 text-sm backdrop-blur">
          <div className="mb-3 flex justify-end">
            <button onClick={() => setPanel("none")} aria-label="閉じる" className="text-cyan-400 hover:text-cyan-100">
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
          <form onSubmit={savePlace} className="flex gap-2">
            <WeatherIcon code={0} className="h-6 w-6 shrink-0 text-cyan-300" />
            <input
              value={placeInput}
              onChange={(e) => setPlaceInput(e.target.value)}
              placeholder={place ? place.name : "天気の地域（例: 横浜市）"}
              className="min-w-0 flex-1 rounded border border-cyan-700/60 bg-slate-900 px-2 py-1"
            />
            <button className="rounded bg-cyan-700 px-3 text-white">保存</button>
          </form>
          {speaker.japaneseVoices.length > 1 && (
            <div className="mt-3 flex items-center gap-2">
              <SpeakerIcon className="h-6 w-6 shrink-0 text-cyan-300" />
              <select
                value={speaker.voiceName ?? ""}
                onChange={(e) => {
                  speaker.setVoiceName(e.target.value);
                  save(VOICE_KEY, e.target.value);
                }}
                className="min-w-0 flex-1 rounded border border-cyan-700/60 bg-slate-900 px-2 py-1"
                aria-label="声"
              >
                {speaker.japaneseVoices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* 会話の履歴と文字入力（右から出るパネル） */}
      <aside
        className={
          "absolute inset-y-0 right-0 z-10 flex w-[440px] max-w-full flex-col border-l border-cyan-400/25 bg-slate-950/95 backdrop-blur transition-transform duration-300 " +
          (panel === "chat" ? "translate-x-0" : "translate-x-full")
        }
        aria-hidden={panel !== "chat"}
      >
        <div className="flex justify-end px-4 pt-4">
          <button onClick={() => setPanel("none")} aria-label="閉じる" className="text-cyan-400 hover:text-cyan-100">
            <CloseIcon className="h-6 w-6" />
          </button>
        </div>
        <div className="min-h-0 flex-1">{panel === "chat" && <Chat supabase={supabase} session={session} embedded />}</div>
      </aside>
    </div>
  );
}
