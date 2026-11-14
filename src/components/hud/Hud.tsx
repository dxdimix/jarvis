"use client";

// ディミのメイン画面（声が中心）。文字は最小限にし、操作はアイコンだけ。
// - 中央: 光る球体とリング。周りをデータが流れ続ける
// - 下中央: マイク。左下: 日時。右下: 天気。左上: PC の状態
// - 右上のアイコン: 会話（履歴と文字入力のパネル）、ブックマーク、覚えていること、設定、全画面
//   読み上げ・声・呼びかけなどの設定は、すべて設定の画面（Settings.tsx）にまとめる

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Message } from "@/lib/types";
import { takeSpeakable } from "@/lib/speech";
import { fetchWeather, findPlace, weatherLabel, type Place, type Weather } from "@/lib/weather";
import { useAgentOnline } from "@/hooks/useAgentOnline";
import { useSpeaker } from "@/hooks/useSpeaker";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";
import { useWakeWord } from "@/hooks/useWakeWord";
import { useActiveDevice } from "@/hooks/useActiveDevice";
import { toSpeech } from "@/lib/wake";
import { Chat } from "@/components/Chat";
import { APPS, detectOpenCommand } from "@/lib/apps";
import { matchBookmark, type Bookmark } from "@/lib/bookmarks";
import { AppDock, AppWindows, useAppWindows } from "./AppWindows";
import { Ring, type RingMode, type RingTone } from "./Ring";
import { DataField } from "./DataField";
import { Settings } from "./Settings";
import { HudChrome } from "./HudChrome";
import { DropOverlay, PinBoard, usePinBoard, usePinDrop } from "@/components/pins/PinBoard";
import { PinAdd } from "@/components/pins/PinAdd";
import { ScreenPicker } from "@/components/pins/ScreenPicker";
import {
  ChatIcon,
  CloseIcon,
  ExpandIcon,
  GearIcon,
  MemoryIcon,
  PaletteIcon,
  PinIcon,
  BookmarkIcon,
  MicIcon,
  PcIcon,
  ShrinkIcon,
  StopIcon,
  WeatherIcon,
} from "./Icons";

const PLACE_KEY = "dimy.weatherPlace";
const SPEAK_KEY = "dimy.speak";
const WAKE_KEY = "dimy.wake"; // 「ディミ」の呼びかけを待つか（端末ごと。最初はオフ）
const VOICE_KEY = "dimy.voice";
const RATE_KEY = "dimy.rate"; // 話す速さ
const PITCH_KEY = "dimy.pitch"; // 声の高さ
const VOLUME_KEY = "dimy.volume"; // ディミの声の大きさ（PC 全体の音量とは別）
const FOLLOW_KEY = "dimy.followSec"; // 返事のあと、続けて話せる時間（秒）
const HOTKEY_KEY = "dimy.hotkey"; // 右 Ctrl を 2 回で話すか
const CAPTION_KEY = "dimy.captionSec"; // 返事の字幕を出しておく時間（秒）

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
function loadNumber(key: string, fallback: number) {
  const v = load(key);
  const n = v === null ? NaN : Number(v);
  return Number.isFinite(n) ? n : fallback;
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
  // ディミの画面が複数開いているときは、最後に操作した画面だけが話す・聞く
  const { leader: isLeader, leaderRef } = useActiveDevice(supabase);
  const now = useNow();
  const [messages, setMessages] = useState<Message[]>([]);
  const [panel, setPanel] = useState<"none" | "chat" | "settings" | "bookmarks" | "pin" | "palette">("none");
  // Chrome のブックマーク（PC のディミが写したもの）。表がまだないときは空のまま
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const bookmarksRef = useRef<Bookmark[]>([]);
  const [bookmarkQuery, setBookmarkQuery] = useState("");
  // ブラウザに別タブを止められたときに、押して開くためのリンク
  const [pendingLink, setPendingLink] = useState<Bookmark | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [speakOn, setSpeakOn] = useState(true);
  const [wakeOn, setWakeOn] = useState(false);
  const [followSec, setFollowSec] = useState(8);
  const [hotkeyOn, setHotkeyOn] = useState(true);
  const [captionSec, setCaptionSec] = useState(12);
  // 返事を言い終えたら、続けて話せる状態にする（呼びかけを待つ設定のとき）
  const followUpAfterSpeech = useRef(false);
  const wakeRef = useRef<{ followUp: () => void } | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
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
    setWakeOn(load(WAKE_KEY) === "on");
    setFollowSec(loadNumber(FOLLOW_KEY, 8));
    setHotkeyOn(load(HOTKEY_KEY) !== "off");
    setCaptionSec(loadNumber(CAPTION_KEY, 12));
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

  // ブックマークを読む（開いたときと、一覧を開いたとき）
  const loadBookmarks = useCallback(() => {
    supabase
      .from("bookmarks")
      .select("title, url, folder")
      .order("sort")
      .limit(3000)
      .then(({ data, error }) => {
        if (error || !data) return;
        bookmarksRef.current = data as Bookmark[];
        setBookmarks(data as Bookmark[]);
      });
  }, [supabase]);
  useEffect(() => {
    loadBookmarks();
  }, [loadBookmarks]);

  const speaker = useSpeaker(() => {
    setCaptionUntil(Date.now() + captionSec * 1000);
    if (followUpAfterSpeech.current) {
      followUpAfterSpeech.current = false;
      wakeRef.current?.followUp();
    }
  }, {
    voiceName: load(VOICE_KEY),
    rate: loadNumber(RATE_KEY, NaN) || undefined,
    pitch: loadNumber(PITCH_KEY, NaN) || undefined,
    volume: loadNumber(VOLUME_KEY, NaN),
  });
  const { speak, cancel: cancelSpeech } = speaker;

  const appWins = useAppWindows();
  const { open: openApp } = appWins;
  // 画面からのお知らせ（「FX を開きます」など）。字幕に少しだけ出す
  const [notice, setNotice] = useState<{ text: string; until: number } | null>(null);
  const announce = useCallback(
    (text: string) => {
      setNotice({ text, until: Date.now() + 6000 });
      if (speakOn && leaderRef.current) speak(toSpeech(text));
    },
    [speak, speakOn, leaderRef],
  );

  // 話しかけられた内容の扱い（マイクのボタンでも、呼びかけでも同じ）
  const handleUtterance = useCallback(
      async (text: string) => {
        setError("");
        // 「〇〇を開いて」は、ディミに聞かずにこの画面ですぐ開く
        const app = detectOpenCommand(text);
        if (app) {
          announce(openApp(app.id) ? `${app.name}を開きます` : `ブラウザに止められました。左のアイコンから${app.name}を開いてください`);
          return;
        }
        // アプリの一覧になければ、Chrome のブックマークから探して、別のタブで開く
        const bm = matchBookmark(text, bookmarksRef.current);
        if (bm) {
          const opened = window.open(bm.url, "_blank") !== null;
          if (opened) announce(`${bm.title}を開きます`);
          else {
            setPendingLink(bm);
            announce(`${bm.title}は、下のボタンを押すと開きます`);
          }
          return;
        }
        const { error } = await supabase.from("messages").insert({ role: "user", content: text });
        if (error) setError(`送信できませんでした: ${error.message}`);
      },
      [supabase, announce, openApp],
  );
  const recognition = useSpeechRecognition(handleUtterance);

  // 「ディミ」と呼ばれたときだけ反応する聞き取り
  const wake = useWakeWord({
    enabled: wakeOn && isLeader,
    speaking: speaker.speaking || recognition.listening,
    followMs: followSec * 1000,
    volume: speaker.volume,
    onWake: () => announce("はい"),
    onCommand: handleUtterance,
    onControl: (c) => {
      if (c === "end") announce("わかりました");
      if (c === "cancel") announce("取り消しました");
      if (c === "mute") {
        setWakeOn(false);
        save(WAKE_KEY, "off");
        announce("聞くのをやめます");
      }
    },
  });
  useEffect(() => {
    wakeRef.current = wake;
  });

  // ショートカット: Alt + 数字でアプリを開く（左のアイコンの上から順）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!e.altKey || e.ctrlKey || e.metaKey) return;
      const n = Number.parseInt(e.key, 10);
      if (n >= 1 && n <= APPS.length) {
        e.preventDefault();
        openApp(APPS[n - 1].id);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openApp]);

  // 返事を 1 文書き終わるごとに読み上げる（この画面を開いてから届いた返事だけ）
  useEffect(() => {
    for (const m of messages) {
      if (m.role !== "assistant" || !liveIds.current.has(m.id)) continue;
      const final = m.status !== "processing";
      // 最初の 1 文はすぐ読み、そのあとは 40 文字ほどたまってからまとめて読む（細切れの間を減らす）
      const from = spokenUpTo.current.get(m.id) ?? 0;
      const { chunk, next } = takeSpeakable(m.content, from, final, from === 0 ? 0 : 40);
      spokenUpTo.current.set(m.id, next);
      if (speakOn && chunk && leaderRef.current) speak(toSpeech(chunk));
      if (final) {
        liveIds.current.delete(m.id);
        // 呼びかけを待つ設定なら、言い終えたあと 8 秒は続けて話せるようにする
        if (wakeOn) {
          if (speakOn) followUpAfterSpeech.current = true;
          else wakeRef.current?.followUp();
        }
        // eslint-disable-next-line react-hooks/set-state-in-effect -- 返事が届いた時刻から字幕を出す
        setCaptionUntil(Date.now() + captionSec * 1000);
      }
    }
  }, [messages, speak, speakOn, wakeOn, captionSec, leaderRef]);

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
  const wakeListening = wake.state === "command" || wake.state === "followup";
  const mode: RingMode = recognition.listening || wakeListening ? "listening" : speaker.speaking ? "speaking" : waiting ? "thinking" : "idle";
  const tone: RingTone = online === false ? "offline" : "normal";
  const lastReply = [...messages].reverse().find((m) => m.role === "assistant");
  const noticeOn = notice !== null && now !== null && now.getTime() < notice.until;
  const showCaption =
    recognition.listening || wakeListening || speaker.speaking || (lastReply?.status === "processing") || (now !== null && now.getTime() < captionUntil) || noticeOn;
  const caption = recognition.listening ? recognition.interim : wakeListening ? wake.interim || "どうぞ" : noticeOn ? notice!.text : lastReply?.content ?? "";

  // 固定ウィンドウ（メイン画面に置いておくページや映像）
  const pins = usePinBoard("hud", session);
  const dragging = usePinDrop((url, at) => pins.addWeb(url, at));

  // 今日の会話の数（計器に出す）
  const [todayCount, setTodayCount] = useState<number | null>(null);
  const userMsgs = messages.filter((m) => m.role === "user").length;
  useEffect(() => {
    const start = new Date(new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Tokyo" }) + "T00:00:00+09:00");
    supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("role", "user")
      .gte("created_at", start.toISOString())
      .then(({ count }) => setTodayCount(count ?? null));
  }, [supabase, userMsgs]);

  function onMic() {
    cancelSpeech();
    // 呼びかけを待つ設定なら、「ディミ」と言わずにすぐ話せる状態にする
    if (wakeOn) return wakeListening ? wake.finish() : wake.startCommand();
    if (recognition.listening) return recognition.stop();
    recognition.start();
  }
  // PC で右 Ctrl を 2 回押したとき（常駐プログラムが知らせてくる）: 話し始め / 話し終わって送る
  const onMicRef = useRef(onMic);
  const hotkeyRef = useRef(hotkeyOn);
  useEffect(() => {
    onMicRef.current = onMic;
    hotkeyRef.current = hotkeyOn;
  });
  useEffect(() => {
    const channel = supabase
      .channel("dimy-control")
      .on("broadcast", { event: "hotkey" }, () => {
        // スマホなど、指で操作する端末では反応しない（PC で押したキーでスマホが聞き始めないように）
        if (window.matchMedia("(pointer: coarse)").matches) return;
        if (!hotkeyRef.current) return; // 設定でオフにしている
        if (!leaderRef.current) return; // ほかの画面が担当（最後に操作した画面だけが反応する）
        onMicRef.current();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, leaderRef]);

  // 設定の画面を閉じる（Esc で閉じるときに使うので、毎回同じ関数にする）
  const closePanel = useCallback(() => setPanel("none"), []);

  function changeWake(next: boolean) {
    setWakeOn(next);
    save(WAKE_KEY, next ? "on" : "off");
    if (next) announce("「ディミ」と呼んでください");
  }

  function changeSpeak(next: boolean) {
    setSpeakOn(next);
    save(SPEAK_KEY, next ? "on" : "off");
    if (!next) cancelSpeech();
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  // 天気の地域を保存する。見つからないときは理由を返す
  async function savePlace(name: string): Promise<string | null> {
    try {
      const p = await findPlace(name);
      if (!p) return "その地名が見つかりませんでした。市区町村の名前で入れてください。";
      save(PLACE_KEY, JSON.stringify(p));
      setPlace(p);
      return null;
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    }
  }

  const time = now?.toLocaleTimeString("ja-JP", { timeZone: "Asia/Tokyo", hour: "2-digit", minute: "2-digit" });
  const date = now?.toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short" });
  const pcLabel = online ? "PC オンライン" : online === false ? "PC オフライン" : "PC 確認中";

  return (
    <div className="dimy-grid relative h-dvh w-full overflow-hidden text-cyan-100">
      <DataField mode={mode} tone={tone} />
      <HudChrome now={now} mode={mode} online={online} messages={messages} todayCount={todayCount} pinCount={pins.pins.length} />

      {/* 中央：球体とリング */}
      <div className="absolute inset-0 grid place-items-center">
        <div className="aspect-square w-[min(62vmin,640px)]">
          <Ring mode={mode} tone={tone} waiting={wakeOn && isLeader && wake.state === "standby"} />
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
      <nav className="absolute right-5 top-5 z-[800] flex gap-2">
        <button onClick={() => setPanel(panel === "chat" ? "none" : "chat")} className={iconBtn} title="会話の履歴と文字入力" aria-label="会話の履歴と文字入力">
          <ChatIcon className="h-5 w-5" />
        </button>
        <button
          onClick={() => {
            if (panel !== "bookmarks") loadBookmarks();
            setPanel(panel === "bookmarks" ? "none" : "bookmarks");
          }}
          className={iconBtn}
          title="ブックマーク"
          aria-label="ブックマーク"
        >
          <BookmarkIcon className="h-5 w-5" />
        </button>
        <Link href="/memory" className={iconBtn} title="覚えていること" aria-label="覚えていること">
          <MemoryIcon className="h-5 w-5" />
        </Link>
        <button onClick={() => setPanel(panel === "pin" ? "none" : "pin")} className={iconBtn} title="固定ウィンドウを置く" aria-label="固定ウィンドウを置く">
          <PinIcon className="h-5 w-5" />
        </button>
        <button onClick={() => setPanel(panel === "palette" ? "none" : "palette")} className={iconBtn} title="パレットをほかのモニターに開く" aria-label="パレットを開く">
          <PaletteIcon className="h-5 w-5" />
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

      {/* 下中央：マイク（小窓より手前に出す。周りの空いた所は、下の小窓をそのまま触れるようにする） */}
      <div className="pointer-events-none absolute inset-x-0 bottom-8 z-[900] flex flex-col items-center [&>*]:pointer-events-auto">
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
        {pendingLink && (
          <button
            onClick={() => {
              window.open(pendingLink.url, "_blank", "noopener");
              setPendingLink(null);
            }}
            className="mt-3 flex items-center gap-2 rounded-full border border-cyan-300/60 bg-cyan-500/10 px-4 py-1.5 text-sm text-cyan-100 shadow-[0_0_16px_rgba(34,211,238,0.35)]"
          >
            <BookmarkIcon className="h-4 w-4" />
            {pendingLink.title}
          </button>
        )}
        {(error || recognition.error || wake.error) && (
          <p className="mt-2 text-xs text-rose-300">{error || recognition.error || wake.error}</p>
        )}
      </div>

      {/* ブックマークの一覧（Chrome のブックマーク。押すと別のタブで開く） */}
      {panel === "bookmarks" && (
        <div className="absolute right-5 top-20 z-[950] flex max-h-[70vh] w-96 max-w-[calc(100vw-2.5rem)] flex-col rounded-lg border border-cyan-400/30 bg-slate-950/90 p-3 text-sm backdrop-blur">
          <div className="mb-2 flex items-center gap-2">
            <input
              autoFocus
              value={bookmarkQuery}
              onChange={(e) => setBookmarkQuery(e.target.value)}
              placeholder="ブックマークを探す"
              className="min-w-0 flex-1 rounded border border-cyan-700/60 bg-slate-900 px-2 py-1"
            />
            <button onClick={() => setPanel("none")} aria-label="閉じる" className="text-cyan-400 hover:text-cyan-100">
              <CloseIcon className="h-5 w-5" />
            </button>
          </div>
          <ul className="min-h-0 flex-1 overflow-y-auto">
            {bookmarks.length === 0 && (
              <li className="px-2 py-3 text-xs text-slate-400">まだありません。デスクトップ PC のディミが、Chrome のブックマークを写すと表示されます。</li>
            )}
            {bookmarks
              .filter((b) => !bookmarkQuery || (b.title + b.folder + b.url).toLowerCase().includes(bookmarkQuery.toLowerCase()))
              .slice(0, 300)
              .map((b, i) => (
                <li key={i}>
                  <a
                    href={b.url}
                    target="_blank"
                    rel="noopener"
                    className="block rounded px-2 py-1.5 hover:bg-cyan-400/10"
                  >
                    <div className="truncate text-cyan-100">{b.title}</div>
                    <div className="truncate text-[10px] text-slate-500">{b.folder}</div>
                  </a>
                </li>
              ))}
          </ul>
        </div>
      )}

      {/* 設定（カテゴリーごとのタブ） */}
      {panel === "settings" && (
        <Settings
          onClose={closePanel}
          speakOn={speakOn}
          setSpeakOn={changeSpeak}
          voices={speaker.japaneseVoices}
          voiceName={speaker.voiceName}
          setVoiceName={(name) => {
            speaker.setVoiceName(name);
            save(VOICE_KEY, name);
          }}
          rate={speaker.rate}
          setRate={(v) => {
            speaker.setRate(v);
            save(RATE_KEY, String(v));
          }}
          volume={speaker.volume}
          setVolume={(v) => {
            speaker.setVolume(v);
            save(VOLUME_KEY, String(v));
          }}
          pitch={speaker.pitch}
          setPitch={(v) => {
            speaker.setPitch(v);
            save(PITCH_KEY, String(v));
          }}
          onTestVoice={() => {
            cancelSpeech();
            speaker.speak("はい、ディミです。この速さで話します。");
          }}
          wakeSupported={wake.supported}
          wakeStatus={
            !wakeOn
              ? "オフ"
              : !isLeader
                ? "ほかの画面が担当しています（この画面をクリックすると、この画面が聞きます）"
                : wake.error || (wake.running ? "聞いています" : "聞き取りを始めています…")
          }
          wakeLastHeard={wake.lastHeard}
          wakeOn={wakeOn}
          setWakeOn={changeWake}
          followSec={followSec}
          setFollowSec={(v) => {
            setFollowSec(v);
            save(FOLLOW_KEY, String(v));
          }}
          hotkeyOn={hotkeyOn}
          setHotkeyOn={(v) => {
            setHotkeyOn(v);
            save(HOTKEY_KEY, v ? "on" : "off");
          }}
          place={place}
          onSavePlace={savePlace}
          captionSec={captionSec}
          setCaptionSec={(v) => {
            setCaptionSec(v);
            save(CAPTION_KEY, String(v));
          }}
        />
      )}

      {/* 左端：アプリのショートカット。開いたアプリの小窓 */}
      <PinBoard state={pins} className="z-[5]" />
      {panel === "pin" && <PinAdd state={pins} onClose={closePanel} className="absolute right-5 top-20 z-[850]" />}
      {panel === "palette" && <ScreenPicker onClose={closePanel} className="absolute right-5 top-20 z-[850]" />}
      <DropOverlay show={dragging} />
      <AppDock onOpen={openApp} />
      <AppWindows state={appWins} />

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
