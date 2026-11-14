"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// ブラウザの音声認識（Web Speech API）の最低限の型。TypeScript の標準の型には入っていないため自前で書く。
export type RecognitionResultEvent = {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
};
export type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: RecognitionResultEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  onstart?: (() => void) | null;
};
export type RecognitionConstructor = new () => Recognition;

export function getRecognitionClass(): RecognitionConstructor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as { SpeechRecognition?: RecognitionConstructor; webkitSpeechRecognition?: RecognitionConstructor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

const ERROR_MESSAGES: Record<string, string> = {
  "not-allowed": "マイクの使用が許可されていません。ブラウザのアドレス欄の左のアイコンから、マイクを許可してください。",
  "audio-capture": "マイクが見つかりません。",
  network: "音声認識の通信に失敗しました。",
};

/**
 * マイクで話した言葉を文字にする。話し終えたら onFinal に全文を渡す。
 * 話している途中の文字は interim で見られる。
 * 注意: Chrome / Edge の音声認識は、音声をブラウザの提供元（Google / Microsoft）のサーバーに送って文字にする。
 */
export function useSpeechRecognition(onFinal: (text: string) => void, opts: { silenceMs?: number } = {}) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const recRef = useRef<Recognition | null>(null);
  const discard = useRef(false); // 強制停止のときは、聞き取った言葉を送らない
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);
  // 話し終わりとみなすまでの無音の時間（設定で変えられる）
  const silenceMs = useRef(opts.silenceMs ?? 1500);
  useEffect(() => {
    silenceMs.current = opts.silenceMs ?? 1500;
  });

  useEffect(() => {
    // 対応しているかはブラウザでしか分からないので、表示後に確かめる。
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSupported(getRecognitionClass() !== null);
    return () => recRef.current?.abort();
  }, []);

  const start = useCallback(() => {
    const Cls = getRecognitionClass();
    if (!Cls || recRef.current) return;
    const rec = new Cls();
    rec.lang = "ja-JP";
    rec.interimResults = true;
    // ブラウザに任せると、少し間が空いただけで聞き取りが終わってしまう。
    // そこで聞き続ける設定にして、無音が silenceMs 続いたら自分で止める。
    rec.continuous = true;
    discard.current = false;
    let finalText = "";
    let timer: ReturnType<typeof setTimeout> | null = null;
    const arm = (ms: number) => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => rec.stop(), ms);
    };
    arm(Math.max(8000, silenceMs.current)); // 何も話さないまま 8 秒たったら終える
    rec.onresult = (e) => {
      let text = "";
      finalText = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else text += r[0].transcript;
      }
      setInterim(finalText + text);
      arm(silenceMs.current);
    };
    rec.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") setError(ERROR_MESSAGES[e.error] ?? `音声認識のエラー: ${e.error}`);
    };
    rec.onend = () => {
      if (timer) clearTimeout(timer);
      recRef.current = null;
      setListening(false);
      setInterim("");
      const text = finalText.trim();
      if (text && !discard.current) onFinalRef.current(text);
      discard.current = false;
    };
    recRef.current = rec;
    setError("");
    setListening(true);
    rec.start();
  }, []);

  const stop = useCallback(() => recRef.current?.stop(), []);

  /** 強制停止: 聞き取りをやめ、聞き取った言葉は送らない */
  const cancel = useCallback(() => {
    if (!recRef.current) return;
    discard.current = true;
    recRef.current.abort();
  }, []);

  return { supported, listening, interim, error, start, stop, cancel };
}
