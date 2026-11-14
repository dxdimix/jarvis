"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session, SupabaseClient } from "@supabase/supabase-js";
import type { Message } from "@/lib/types";
import { FeedbackBar, type Feedback } from "@/components/FeedbackBar";
import { MicIcon, StopIcon } from "@/components/hud/Icons";
import { takeSpeakable } from "@/lib/speech";
import { useAgentOnline } from "@/hooks/useAgentOnline";
import { useSpeaker } from "@/hooks/useSpeaker";
import { useSpeechRecognition } from "@/hooks/useSpeechRecognition";

const HISTORY_LIMIT = 100;

// 読み上げなどの設定はこのブラウザにだけ保存する（保存できない環境でも動くようにする）。
function loadSetting(key: string, fallback: string) {
  try {
    // 以前の名前（jarvis.〇〇）で保存した設定も引き継ぐ。
    return (
      localStorage.getItem(`dimy.${key}`) ??
      localStorage.getItem(`kymis.${key}`) ??
      localStorage.getItem(`jarvis.${key}`) ??
      fallback
    );
  } catch {
    return fallback;
  }
}
function saveSetting(key: string, value: string) {
  try {
    localStorage.setItem(`dimy.${key}`, value);
  } catch {}
}

/**
 * 会話の画面。
 * embedded: 全画面（声が中心の画面）の横のパネルに入れる用。履歴と文字入力だけを出し、読み上げとマイクは全画面側に任せる。
 */
export function Chat({
  supabase,
  session,
  embedded = false,
}: {
  supabase: SupabaseClient;
  session: Session;
  embedded?: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  // 返事への評価（message_id → 評価）。表がまだない場合は、評価のボタンを出さない
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [feedbackReady, setFeedbackReady] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState("");
  const [speakOn, setSpeakOn] = useState(
    () => loadSetting("speak", "on") === "on",
  );
  const [talkMode, setTalkMode] = useState(
    () => loadSetting("talk", "off") === "on",
  );
  const bottomRef = useRef<HTMLDivElement>(null);
  const online = useAgentOnline(supabase, !embedded);

  // この画面を開いてから届いた返事だけを読み上げる（過去の履歴は読まない）。
  const liveIds = useRef(new Set<string>());
  const spokenUpTo = useRef(new Map<string, number>());
  // 返事を読み終えたら、会話モードならマイクを再びオンにする。
  const listenAfterSpeech = useRef(false);

  const send = useCallback(
    async (text: string) => {
      const content = text.trim();
      if (!content) return false;
      setError("");
      const { error } = await supabase
        .from("messages")
        .insert({ role: "user", content });
      if (error) {
        setError(`送信できませんでした: ${error.message}`);
        return false;
      }
      return true;
    },
    [supabase],
  );

  const recognition = useSpeechRecognition((text) => {
    send(text);
  });
  const { start: startListening } = recognition;

  const speaker = useSpeaker(
    () => {
      if (listenAfterSpeech.current) {
        listenAfterSpeech.current = false;
        if (talkMode) startListening();
      }
    },
    {
      voiceName: loadSetting("voice", "") || null,
      rate: Number(loadSetting("rate", "")) || undefined,
      pitch: Number(loadSetting("pitch", "")) || undefined,
    },
  );
  const { speak, cancel: cancelSpeech, isSpeaking } = speaker;

  useEffect(() => {
    let cancelled = false;

    supabase
      .from("messages")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(HISTORY_LIMIT)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) setError(`履歴を読み込めませんでした: ${error.message}`);
        else setMessages((data as Message[]).reverse());
      });
    supabase
      .from("feedback")
      .select("message_id, rating, comment")
      .order("created_at", { ascending: false })
      .limit(300)
      .then(({ data, error }) => {
        if (cancelled || error) return;
        setFeedback(
          Object.fromEntries(
            (data ?? []).map((f) => [
              f.message_id,
              { rating: f.rating, comment: f.comment },
            ]),
          ),
        );
        setFeedbackReady(true);
      });

    // PC 常駐プログラムが返事を書き込んだり、状態を変えたりしたら、すぐ画面に反映する。
    const channel = supabase
      .channel("messages")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        (payload) => {
          if (
            payload.eventType === "INSERT" &&
            (payload.new as Message).role === "assistant"
          ) {
            liveIds.current.add((payload.new as Message).id);
          }
          setMessages((prev) => {
            if (payload.eventType === "DELETE") {
              return prev.filter((m) => m.id !== (payload.old as Message).id);
            }
            const row = payload.new as Message;
            const i = prev.findIndex((m) => m.id === row.id);
            if (i === -1) return [...prev, row];
            const next = prev.slice();
            next[i] = row;
            return next;
          });
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [supabase]);

  // 返事が書き足されるたびに、書き終わった文から読み上げる。
  useEffect(() => {
    for (const m of messages) {
      if (m.role !== "assistant" || !liveIds.current.has(m.id)) continue;
      const final = m.status !== "processing";
      const from = spokenUpTo.current.get(m.id) ?? 0;
      const { chunk, next } = takeSpeakable(m.content, from, final);
      spokenUpTo.current.set(m.id, next);
      if (!embedded && speakOn && chunk) speak(chunk);
      if (final) {
        liveIds.current.delete(m.id);
        if (!embedded && talkMode) {
          // 読み上げ中なら読み終えてから、読み上げないならすぐにマイクをオンにする。
          if (speakOn && isSpeaking()) listenAfterSpeech.current = true;
          else startListening();
        }
      }
    }
  }, [
    messages,
    speakOn,
    talkMode,
    speak,
    isSpeaking,
    startListening,
    embedded,
  ]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input;
    setInput("");
    if (!(await send(text))) setInput(text);
  }

  function onMic() {
    if (recognition.listening) return recognition.stop();
    cancelSpeech(); // 話しかけるときは読み上げを止める
    recognition.start();
  }

  function toggleSpeak() {
    const next = !speakOn;
    setSpeakOn(next);
    saveSetting("speak", next ? "on" : "off");
    if (!next) cancelSpeech();
  }

  function toggleTalk() {
    const next = !talkMode;
    setTalkMode(next);
    saveSetting("talk", next ? "on" : "off");
    if (next && !recognition.listening) recognition.start();
    if (!next) recognition.stop();
  }

  // 返事を書き始めた発言には「考えています…」を出さない。
  const repliedIds = new Set(
    messages.map((m) => m.reply_to).filter((id): id is string => id !== null),
  );
  const waiting = messages.some(
    (m) =>
      m.role === "user" &&
      (m.status === "pending" || m.status === "processing"),
  );

  return (
    <div
      className={
        embedded
          ? "flex h-full w-full flex-col px-4 pt-4"
          : "mx-auto flex h-dvh w-full max-w-2xl flex-col px-4"
      }
    >
      {!embedded && (
        <header className="flex flex-wrap items-center justify-between gap-2 py-4">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-widest text-cyan-400">
              DIMY
            </h1>
            <span
              className="flex items-center gap-1.5 text-xs text-slate-400"
              data-testid="agent-status"
            >
              <span
                className={
                  "inline-block h-2 w-2 rounded-full " +
                  (online
                    ? "bg-emerald-400"
                    : online === false
                      ? "bg-slate-500"
                      : "bg-amber-400")
                }
              />
              {online
                ? "PC: オンライン"
                : online === false
                  ? "PC: オフライン"
                  : "PC: 確認中"}
            </span>
          </div>
          <div className="flex items-center gap-3 text-sm text-slate-400">
            <span className="hidden sm:inline">{session.user.email}</span>
            <Link href="/" className="underline hover:text-slate-200">
              メイン画面
            </Link>
            <Link href="/memory" className="underline hover:text-slate-200">
              覚えていること
            </Link>
            <button
              onClick={() => supabase.auth.signOut()}
              className="underline hover:text-slate-200"
            >
              ログアウト
            </button>
          </div>
        </header>
      )}

      {!embedded && (
        <div className="flex flex-wrap items-center gap-2 pb-3 text-xs">
          {speaker.supported && (
            <button
              onClick={toggleSpeak}
              aria-pressed={speakOn}
              className={
                "rounded-full border px-3 py-1 " +
                (speakOn
                  ? "border-cyan-500 text-cyan-300"
                  : "border-slate-700 text-slate-400")
              }
            >
              読み上げ {speakOn ? "オン" : "オフ"}
            </button>
          )}
          {recognition.supported && (
            <button
              onClick={toggleTalk}
              aria-pressed={talkMode}
              title="返事を聞き終えたら、自動でマイクがオンになります"
              className={
                "rounded-full border px-3 py-1 " +
                (talkMode
                  ? "border-cyan-500 text-cyan-300"
                  : "border-slate-700 text-slate-400")
              }
            >
              会話モード {talkMode ? "オン" : "オフ"}
            </button>
          )}
          {speaker.supported &&
            speakOn &&
            speaker.japaneseVoices.length > 1 && (
              <select
                value={speaker.voiceName ?? ""}
                onChange={(e) => {
                  speaker.setVoiceName(e.target.value);
                  saveSetting("voice", e.target.value);
                }}
                className="rounded border border-slate-700 bg-slate-900 px-2 py-1 text-slate-300"
                aria-label="声"
              >
                {speaker.japaneseVoices.map((v) => (
                  <option key={v.name} value={v.name}>
                    {v.name}
                  </option>
                ))}
              </select>
            )}
        </div>
      )}

      <main className="flex-1 space-y-3 overflow-y-auto pb-4">
        {messages.length === 0 && (
          <p className="mt-16 text-center text-slate-500">
            話しかけてください。PC の常駐プログラムが答えます。
          </p>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            className={
              m.role === "user" ? "flex justify-end" : "flex justify-start"
            }
          >
            <div
              className={
                "max-w-[85%] whitespace-pre-wrap rounded-lg px-3 py-2 " +
                (m.role === "user"
                  ? "bg-cyan-700 text-white"
                  : "bg-slate-800 text-slate-100")
              }
            >
              {m.content}
              {m.role === "assistant" && m.status === "processing" && (
                <span className="ml-0.5 inline-block animate-pulse text-cyan-400">
                  ▍
                </span>
              )}
              {m.role === "user" && m.status === "pending" && (
                <div className="mt-1 text-xs text-cyan-200">
                  {online === false
                    ? "PC がオフラインです。PC の常駐プログラムが動くと返事をします"
                    : "PC の応答待ち"}
                </div>
              )}
              {m.role === "user" &&
                m.status === "processing" &&
                !repliedIds.has(m.id) && (
                  <div className="mt-1 text-xs text-cyan-200">
                    考えています…
                  </div>
                )}
              {m.status === "error" && (
                <div className="mt-1 text-xs text-red-300">
                  エラー: {m.error}
                </div>
              )}
              {feedbackReady &&
                m.role === "assistant" &&
                m.status === "done" && (
                  <FeedbackBar
                    supabase={supabase}
                    messageId={m.id}
                    value={feedback[m.id]}
                    onChange={(f) =>
                      setFeedback((prev) => {
                        const next = { ...prev };
                        if (f) next[m.id] = f;
                        else delete next[m.id];
                        return next;
                      })
                    }
                  />
                )}
            </div>
          </div>
        ))}
        <div ref={bottomRef} />
      </main>

      {(error || recognition.error) && (
        <p className="pb-2 text-sm text-red-400">
          {error || recognition.error}
        </p>
      )}
      <form onSubmit={onSubmit} className="flex gap-2 pb-4">
        <input
          autoFocus={embedded}
          value={recognition.listening ? recognition.interim : input}
          onChange={(e) => setInput(e.target.value)}
          readOnly={recognition.listening}
          placeholder={
            recognition.listening
              ? "聞いています…"
              : waiting
                ? "返事を待っています…"
                : "ディミに話しかける"
          }
          className="min-w-0 flex-1 rounded border border-slate-700 bg-slate-900 px-3 py-2"
        />
        {!embedded && recognition.supported && (
          <button
            type="button"
            onClick={onMic}
            aria-label={
              recognition.listening ? "聞き取りをやめる" : "マイクで話しかける"
            }
            className={
              "rounded px-3 py-2 font-medium text-white " +
              (recognition.listening
                ? "animate-pulse bg-red-600"
                : "bg-slate-700 hover:bg-slate-600")
            }
          >
            {recognition.listening ? <StopIcon className="h-5 w-5" /> : <MicIcon className="h-5 w-5" />}
          </button>
        )}
        <button className="rounded bg-cyan-600 px-4 py-2 font-medium text-white hover:bg-cyan-500">
          送信
        </button>
      </form>
    </div>
  );
}
