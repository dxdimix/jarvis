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
import { isEcho, toSpeech } from "@/lib/wake";
import {
  extractAccount,
  matchSession,
  parseMoveCommand,
  parseOpenSite,
  parseSearchCommand,
  parseSessionCommand,
  searchUrl,
  stripBrowser,
} from "@/lib/commands";
import { loadPcState, sendPcCommand, type PcState } from "@/lib/pc";
import { boardLabel, loadPins, savePins, sendPin } from "@/lib/pins";
import { Chat } from "@/components/Chat";
import { APPS, detectOpenCommand } from "@/lib/apps";
import { matchBookmark, type Bookmark } from "@/lib/bookmarks";
import { AppDock, AppWindows, useAppWindows } from "./AppWindows";
import { Ring, type RingMode, type RingTone } from "./Ring";
import { DataField } from "./DataField";
import { Settings } from "./Settings";
import { HudChrome } from "./HudChrome";
import { WeatherPanel } from "./WeatherPanel";
import { CalendarPanel } from "./CalendarPanel";
import { DismissBox } from "./DismissBox";
import { AdminPanel } from "./AdminPanel";
import { logActivity } from "@/lib/activity";
import { DropOverlay, PinBoard, usePinBoard, usePinDrop } from "@/components/pins/PinBoard";
import { PinAdd } from "@/components/pins/PinAdd";
import { ScreenPicker } from "@/components/pins/ScreenPicker";
import {
  ChatIcon,
  CloseIcon,
  ExpandIcon,
  GearIcon,
  MemoryIcon,
  AdminIcon,
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
const ACCOUNT_KEY = "dimy.account"; // ディミの外（Chrome）で開くときの、いつものアカウントの番号
const SILENCE_KEY = "dimy.silenceSec"; // 話し終わりとみなすまでの無音の時間（秒）
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

/** マイクで聞いている間のボタンの印（押すと話し終わって送る。止める印と区別するため） */
function SendGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-7 w-7" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}

export function Hud({ supabase, session }: { supabase: SupabaseClient; session: Session }) {
  const online = useAgentOnline(supabase);
  // ディミの画面が複数開いているときは、最後に操作した画面だけが話す・聞く
  const { leader: isLeader, leaderRef } = useActiveDevice(supabase);
  const now = useNow();
  const [messages, setMessages] = useState<Message[]>([]);
  const [panel, setPanel] = useState<"none" | "chat" | "settings" | "bookmarks" | "pin" | "palette" | "weather" | "calendar" | "admin">("none");
  const panelRef = useRef(panel);
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
  const [silenceSec, setSilenceSec] = useState(1.5);
  const [hotkeyOn, setHotkeyOn] = useState(true);
  const [captionSec, setCaptionSec] = useState(12);
  // 返事を言い終えたら、続けて話せる状態にする（呼びかけを待つ設定のとき）
  const followUpAfterSpeech = useRef(false);
  const wakeRef = useRef<{ followUp: () => void; reset: () => void } | null>(null);
  // 強制停止した発言（この発言への返事は、あとから届いても読み上げない）
  const stoppedReplies = useRef(new Set<string>());
  // 最近読み上げた文（マイクが拾った自分の声を見分けるため）
  const recentSpoken = useRef<{ text: string; at: number }[]>([]);
  // 常駐プログラムへの合図（強制停止）を送るチャンネル
  const controlRef = useRef<ReturnType<SupabaseClient["channel"]> | null>(null);
  const [place, setPlace] = useState<Place | null>(null);
  const [error, setError] = useState("");
  const [captionUntil, setCaptionUntil] = useState(0);
  const weather = useWeather(place);
  const liveIds = useRef(new Set<string>());
  const spokenUpTo = useRef(new Map<string, number>());

  // Google カレンダーのログインから戻ってきたとき: 結果を知らせて、カレンダーを開く
  useEffect(() => {
    const g = new URLSearchParams(location.search).get("google");
    if (!g) return;
    history.replaceState(null, "", location.pathname);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPanel("calendar");
    if (!g.startsWith("connected")) setError(`Google カレンダーとつなげませんでした（${g}）`);
  }, []);

  // ブラウザに保存した設定を読む（ブラウザでしか読めないため、表示のあとで）
  useEffect(() => {
    const p = load(PLACE_KEY);
    /* eslint-disable react-hooks/set-state-in-effect */
    if (p) setPlace(JSON.parse(p) as Place);
    setSpeakOn(load(SPEAK_KEY) !== "off");
    setWakeOn(load(WAKE_KEY) === "on");
    setFollowSec(loadNumber(FOLLOW_KEY, 8));
    setSilenceSec(Math.min(3, Math.max(0.5, loadNumber(SILENCE_KEY, 1.5)))); // 0.5〜3 秒
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
  const { speak: speakRaw, cancel: cancelSpeech } = speaker;
  const speak = useCallback(
    (text: string) => {
      // 念のため: 同じ文を 5 秒以内に 2 回読まない
      const norm = (t: string) => t.replace(/[\s、。,.!！?？]/g, "");
      if (recentSpoken.current.some((x) => Date.now() - x.at < 5_000 && norm(x.text) === norm(text))) return;
      recentSpoken.current = [...recentSpoken.current.filter((x) => Date.now() - x.at < 60_000), { text, at: Date.now() }];
      speakRaw(text);
    },
    [speakRaw],
  );

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
  // 画面だけで済ませる命令（あとで中身を入れる。ここでは入れ物だけ）
  const localCommandRef = useRef<(text: string) => Promise<boolean>>(async () => false);
  const openOutsideRef = useRef<(url: string, title: string, account: number | null) => Promise<void>>(async () => {});
  const accountNamesRef = useRef<Record<number, string>>({});
  const handleUtterance = useCallback(
      async (text: string) => {
        setError("");
        logActivity(supabase, "voice", text);
        // 検索・Chrome で開く・Claude のセッション・ウィンドウを移す、は画面と PC で済ませる（下の localCommandRef）
        if (await localCommandRef.current(text)) return;
        // 「〇〇を開いて」は、ディミに聞かずにこの画面ですぐ開く
        const app = detectOpenCommand(text);
        if (app) {
          const ok = openApp(app.id);
          logActivity(supabase, ok ? "open_app" : "error", ok ? app.name : `${app.name} を開けませんでした（ブラウザに止められた）`);
          announce(ok ? `${app.name}を開きます` : `ブラウザに止められました。左のアイコンから${app.name}を開いてください`);
          return;
        }
        // アプリの一覧になければ、Chrome のブックマークから探して、別のタブで開く
        const acc = extractAccount(text, accountNamesRef.current);
        const bm = matchBookmark(acc.rest, bookmarksRef.current);
        if (bm) {
          await openOutsideRef.current(bm.url, bm.title, acc.account);
          return;
        }
        const { error } = await supabase.from("messages").insert({ role: "user", content: text });
        if (error) setError(`送信できませんでした: ${error.message}`);
      },
      [supabase, announce, openApp],
  );
  const recognition = useSpeechRecognition(handleUtterance, { silenceMs: silenceSec * 1000 });

  // 「ディミ」と呼ばれたときだけ反応する聞き取り
  // 返事を作っている・届いている間（読み上げの合間も含めて、話している最中として扱う）
  const replyActive = messages.some(
    (m) =>
      (m.role === "user" && (m.status === "pending" || m.status === "processing")) ||
      (m.role === "assistant" && m.status === "processing"),
  );
  const wake = useWakeWord({
    enabled: wakeOn && isLeader,
    speaking: speaker.speaking || replyActive,
    paused: recognition.listening,
    isEcho: (t) => recentSpoken.current.some((x) => Date.now() - x.at < 60_000 && isEcho(t, x.text)),
    followMs: followSec * 1000,
    silenceMs: silenceSec * 1000,
    volume: speaker.volume,
    onWake: () => announce("はい"),
    onCommand: handleUtterance,
    onControl: (c) => {
      // 「ストップ」「終わり」「ありがとう」: 聞く・考える・話すをすべて止める
      if (c === "stop" || c === "end") forceStop();
      if (c === "cancel") announce("取り消しました");
      if (c === "mute") {
        forceStop();
        setWakeOn(false);
        save(WAKE_KEY, "off");
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
      // 強制停止した発言への返事は読まない
      if (m.reply_to && stoppedReplies.current.has(m.reply_to)) {
        liveIds.current.delete(m.id);
        continue;
      }
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
  // 字幕の枠（長い返事は、いちばん下＝読んでいるところへ自動で送る）
  const captionRef = useRef<HTMLDivElement>(null);
  const captionFollow = useRef(true);
  const caption = recognition.listening ? recognition.interim : wakeListening ? wake.interim || "どうぞ" : noticeOn ? notice!.text : lastReply?.content ?? "";

  // 固定ウィンドウ（メイン画面に置いておくページや映像）
  const pins = usePinBoard("hud", session);
  const dragging = usePinDrop((url, at) => pins.addWeb(url, at));

  // PC の情報（Chrome のプロフィール＝アカウント、PC の Claude Code のセッション）
  const [pcState, setPcState] = useState<PcState | null>(null);
  const [defaultAccount, setDefaultAccount] = useState(1);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setDefaultAccount(loadNumber(ACCOUNT_KEY, 1));
  }, []);
  const refreshPcState = useCallback(() => {
    loadPcState(supabase).then((st) => st && setPcState(st));
  }, [supabase]);
  useEffect(() => {
    refreshPcState();
    const t = setInterval(refreshPcState, 5 * 60_000);
    return () => clearInterval(t);
  }, [refreshPcState]);

  /** ディミの外（Chrome）で開く。PC が動いていれば、指定のアカウント（Chrome のプロフィール）で PC が開く */
  async function openOutside(url: string, title: string, account: number | null) {
    const n = account ?? defaultAccount;
    logActivity(supabase, "open_chrome", `${title} ${url}（アカウント${n}）`);
    if (online) {
      announce(`${title}を開きます`);
      const r = await sendPcCommand(supabase, "open_url", { url, account: n });
      if (r.ok) return;
      if (r.sent) return announce(r.result || "PC で開けませんでした");
      // 表がまだないなど、PC に送れなかったときは、このブラウザで開く
    }
    if (window.open(url, "_blank") === null) {
      setPendingLink({ title, url, folder: "" });
      announce(`${title}は、下のボタンを押すと開きます`);
    } else announce(`${title}を開きます`);
  }

  /** 固定ウィンドウをまとめて移す（声の「モニター4のパレットに移して」など）。移した数を返す */
  function movePins(from: string, to: string) {
    logActivity(supabase, "move_pins", `${boardLabel(from)} → ${boardLabel(to)}`);
    if (from === "hud") {
      const list = pins.pins.filter((p) => p.kind === "web");
      list.forEach((p) => pins.send(p.id, to));
      return list.length;
    }
    const list = loadPins(from);
    const moving = list.filter((p) => p.kind === "web");
    moving.forEach((p) => sendPin(p, to));
    savePins(from, list.filter((p) => p.kind !== "web"));
    if (to === "hud") pins.reload();
    return moving.length;
  }

  /** 画面と PC だけで済ませる命令。済ませたら true */
  async function localCommand(text: string): Promise<boolean> {
    const names = accountNamesRef.current;
    const done = () => {
      // 呼びかけで話しかけていたら、言い終えたあと続けて話せるようにする
      if (wakeOn) {
        if (speakOn) followUpAfterSpeech.current = true;
        else wakeRef.current?.followUp();
      }
      return true;
    };
    // 「Chrome で」「ブラウザで」が付いていたら、ディミの中ではなく Chrome で開く
    const br = stripBrowser(text);
    const acc0 = extractAccount(br.rest, names);
    if (br.chrome || acc0.account !== null) {
      const app = detectOpenCommand(acc0.rest);
      if (app) {
        await openOutside(app.url, app.name, acc0.account);
        return done();
      }
    }
    const site = parseOpenSite(acc0.rest);
    if (site) {
      await openOutside(site.url, site.name, acc0.account);
      return done();
    }
    text = br.rest;
    const mv = parseMoveCommand(text);
    if (mv) {
      const n = movePins(mv.from, mv.to);
      announce(n ? `${boardLabel(mv.to)}に${n}個移しました` : `${boardLabel(mv.from)}に移せるウィンドウがありません`);
      return done();
    }
    const sc = parseSearchCommand(text, names);
    if (sc) {
      await openOutside(searchUrl(sc), `${sc.site === "youtube" ? "YouTube" : "Google"}で「${sc.query}」`, sc.account);
      return done();
    }
    const ss = parseSessionCommand(extractAccount(text, names).rest);
    if (ss) {
      const acc = extractAccount(text, names).account;
      if (ss.kind !== "chat" && ss.query) {
        const hit = matchSession(pcState?.claude_sessions ?? [], ss.query);
        if (hit) {
          announce(`「${hit.title}」を開きます`);
          logActivity(supabase, "open_session", hit.title);
          const r = await sendPcCommand(supabase, "open_session", { id: hit.id });
          if (!r.ok) announce(r.result || "PC でセッションを開けませんでした");
          return done();
        }
      }
      // claude.ai のチャットと Code のセッションは、名前で探す手段がないので、一覧の画面を開く
      const url = ss.kind === "chat" ? "https://claude.ai/recents" : "https://claude.ai/code";
      if (ss.query) announce(`PC のセッションに「${ss.query}」が見つからないので、claude.ai の一覧を開きます`);
      await openOutside(url, ss.kind === "chat" ? "Claude のチャットの一覧" : "Claude Code のセッションの一覧", acc);
      return done();
    }
    return false;
  }
  useEffect(() => {
    localCommandRef.current = localCommand;
    openOutsideRef.current = openOutside;
    const names: Record<number, string> = {};
    pcState?.chrome_profiles.forEach((p, i) => (names[i + 1] = p.name));
    accountNamesRef.current = names;
  });

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

  /** 強制停止: 聞き取り・考え中（PC の返事作り）・読み上げ・続けて話せる時間を、すべてやめる */
  function forceStop() {
    logActivity(supabase, "stop", "強制停止（ボタン・Esc・声）");
    followUpAfterSpeech.current = false;
    cancelSpeech();
    recognition.cancel();
    wakeRef.current?.reset();
    for (const m of messages) if (m.role === "user") stoppedReplies.current.add(m.id);
    liveIds.current.clear();
    controlRef.current?.send({ type: "broadcast", event: "stop", payload: { at: Date.now() } }).catch(() => {});
    setPendingLink(null);
    setNotice({ text: "STOPPED", until: Date.now() + 2500 });
  }
  const forceStopRef = useRef(forceStop);
  useEffect(() => {
    forceStopRef.current = forceStop;
    panelRef.current = panel;
  });
  // Esc キーでも強制停止（設定などの画面を開いているときは、その画面を閉じるだけ）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && panelRef.current === "none") forceStopRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // 字幕が書き足されたら、いちばん下へ送る（新しい返事のときは、また下を追いかける）
  useEffect(() => {
    const el = captionRef.current;
    if (el && captionFollow.current) el.scrollTop = el.scrollHeight;
  }, [caption]);
  useEffect(() => {
    captionFollow.current = true;
  }, [lastReply?.id]);

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
        logActivity(supabase, "hotkey", "右 Ctrl 2 回（話し始め / 話し終わり）");
        onMicRef.current();
      })
      .subscribe();
    controlRef.current = channel;
    return () => {
      controlRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [supabase, leaderRef]);

  // 設定の画面を閉じる（Esc で閉じるときに使うので、毎回同じ関数にする）
  const closePanel = useCallback(() => setPanel("none"), []);

  function changeWake(next: boolean) {
    logActivity(supabase, "wake", next ? "呼びかけをオン" : "呼びかけをオフ");
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
      {/* 長いときは省かずに、枠の中でスクロールして全文を出す（書き足されるたびに、いちばん下へ送る） */}
      <div
        className={
          "absolute inset-x-0 bottom-32 z-[850] mx-auto max-w-2xl px-6 transition-opacity duration-700 " +
          (showCaption && caption ? "opacity-100" : "pointer-events-none opacity-0")
        }
      >
        <div
          ref={captionRef}
          onScroll={(e) => {
            const el = e.currentTarget;
            // 利用者が上へ戻して読んでいる間は、自動で下へ送らない
            captionFollow.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
          }}
          className="dimy-caption max-h-[7.5rem] overflow-y-auto rounded-md bg-slate-950/45 px-3 py-1 backdrop-blur-sm text-center text-base leading-relaxed text-cyan-100/90 drop-shadow-[0_0_8px_rgba(2,6,23,0.9)] [mask-image:linear-gradient(to_bottom,transparent,black_14px,black)]"
        >
          <p className="whitespace-pre-wrap pt-2">{caption}</p>
        </div>
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
          data-panel-toggle
          title="ブックマーク"
          aria-label="ブックマーク"
        >
          <BookmarkIcon className="h-5 w-5" />
        </button>
        <Link href="/memory" className={iconBtn} title="覚えていること" aria-label="覚えていること">
          <MemoryIcon className="h-5 w-5" />
        </Link>
        <button onClick={() => setPanel(panel === "pin" ? "none" : "pin")} data-panel-toggle className={iconBtn} title="固定ウィンドウを置く" aria-label="固定ウィンドウを置く">
          <PinIcon className="h-5 w-5" />
        </button>
        <button onClick={() => setPanel(panel === "palette" ? "none" : "palette")} data-panel-toggle className={iconBtn} title="パレットをほかのモニターに開く" aria-label="パレットを開く">
          <PaletteIcon className="h-5 w-5" />
        </button>
        <button onClick={() => setPanel(panel === "admin" ? "none" : "admin")} className={iconBtn} title="管理（会話・システム・動作の記録）" aria-label="管理">
          <AdminIcon className="h-5 w-5" />
        </button>
        <button onClick={() => setPanel(panel === "settings" ? "none" : "settings")} className={iconBtn} title="設定" aria-label="設定">
          <GearIcon className="h-5 w-5" />
        </button>
        <button onClick={toggleFullscreen} className={iconBtn} title="全画面" aria-label="全画面の切り替え">
          {fullscreen ? <ShrinkIcon className="h-5 w-5" /> : <ExpandIcon className="h-5 w-5" />}
        </button>
      </nav>

      {/* 左下：日時 */}
      <button
        onClick={() => setPanel(panel === "calendar" ? "none" : "calendar")}
        data-panel-toggle
        className="absolute bottom-6 left-6 rounded-lg px-2 py-1 text-left font-mono transition hover:bg-cyan-400/10"
        title="カレンダー（Google カレンダーの予定）"
        aria-label="カレンダーを開く"
      >
        <div className="text-2xl tracking-widest text-cyan-200 sm:text-4xl drop-shadow-[0_0_10px_rgba(34,211,238,0.45)]">{time}</div>
        <div className="mt-1 text-xs tracking-[0.25em] text-cyan-400/70">{date}</div>
      </button>
      {panel === "calendar" && <CalendarPanel session={session} onClose={closePanel} />}

      {/* 右下：天気 */}
      {weather && (
        <button
          onClick={() => setPanel(panel === "weather" ? "none" : "weather")}
          data-panel-toggle
          className="absolute bottom-6 right-6 flex items-center gap-3 rounded-lg px-2 py-1 text-left transition hover:bg-cyan-400/10"
          title={`${place?.name} ${weatherLabel(weather.code)}（押すと詳しく）`}
          aria-label="天気の詳細"
        >
          <WeatherIcon code={weather.code} className="h-10 w-10 text-cyan-300" />
          <div className="font-mono">
            <div className="text-2xl text-cyan-200 sm:text-3xl">{Math.round(weather.temperature)}°</div>
            <div className="text-xs text-cyan-400/70">
              {Math.round(weather.max)}° / {Math.round(weather.min)}°{weather.rain !== null && ` ・${weather.rain}%`}
            </div>
          </div>
        </button>
      )}
      {panel === "weather" && place && <WeatherPanel place={place} onClose={closePanel} />}

      {/* 下中央：マイク（小窓より手前に出す。周りの空いた所は、下の小窓をそのまま触れるようにする） */}
      <div className="pointer-events-none absolute inset-x-0 bottom-8 z-[900] flex flex-col items-center [&>*]:pointer-events-auto">
        <div className="relative">
        {/* 強制停止（いつも出しておく。動いているときは明るくなる。Esc キー・「ストップ」でも同じ） */}
        <button
          onClick={forceStop}
          title="強制停止（Esc ／「ストップ」）"
          aria-label="強制停止"
          className={
            "absolute -left-16 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-full border backdrop-blur transition " +
            (mode !== "idle" || wakeListening
              ? "border-rose-400/80 bg-rose-500/15 text-rose-200 shadow-[0_0_18px_rgba(244,63,94,0.45)] hover:bg-rose-500/30"
              : "border-cyan-400/25 bg-slate-950/50 text-cyan-300/60 hover:border-rose-400/60 hover:text-rose-200")
          }
        >
          <StopIcon className="h-5 w-5" />
        </button>
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
            {recognition.listening ? <SendGlyph /> : <MicIcon className="h-7 w-7" />}
          </button>
        ) : (
          <button onClick={() => setPanel("chat")} className={iconBtn} aria-label="文字で話しかける" title="このブラウザは音声入力に対応していません。文字で話しかけてください">
            <ChatIcon className="h-5 w-5" />
          </button>
        )}
        </div>
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
        <DismissBox onClose={closePanel} className="absolute right-5 top-20 z-[950] flex max-h-[70vh] w-96 max-w-[calc(100vw-2.5rem)] flex-col rounded-lg border border-cyan-400/30 bg-slate-950/90 p-3 text-sm backdrop-blur">
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
        </DismissBox>
      )}

      {/* 管理（記録を大きな画面で見る・コピーする） */}
      {panel === "admin" && <AdminPanel supabase={supabase} onClose={closePanel} />}

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
          profiles={pcState?.chrome_profiles ?? null}
          defaultAccount={defaultAccount}
          setDefaultAccount={(n) => {
            setDefaultAccount(n);
            save(ACCOUNT_KEY, String(n));
          }}
          onRefreshProfiles={refreshPcState}
          online={online}
          onRestartPc={async () => {
            logActivity(supabase, "restart", "設定から PC の DIMY を再起動");
            const r = await sendPcCommand(supabase, "restart", {});
            if (!r.sent && /check constraint|pc_commands_kind_check/.test(r.result))
              return { ok: false, result: "データベースの更新（20261115100000_pc_commands_restart.sql）がまだです。SQL Editor で実行してください。" };
            return r;
          }}
          silenceSec={silenceSec}
          setSilenceSec={(v) => {
            setSilenceSec(v);
            save(SILENCE_KEY, String(v));
          }}
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
