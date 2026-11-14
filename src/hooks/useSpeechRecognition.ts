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
export function useSpeechRecognition(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const recRef = useRef<Recognition | null>(null);
  const onFinalRef = useRef(onFinal);
  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

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
    rec.continuous = false;
    let finalText = "";
    rec.onresult = (e) => {
      let text = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else text += r[0].transcript;
      }
      setInterim(finalText + text);
    };
    rec.onerror = (e) => {
      if (e.error !== "no-speech" && e.error !== "aborted") setError(ERROR_MESSAGES[e.error] ?? `音声認識のエラー: ${e.error}`);
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      setInterim("");
      const text = finalText.trim();
      if (text) onFinalRef.current(text);
    };
    recRef.current = rec;
    setError("");
    setListening(true);
    rec.start();
  }, []);

  const stop = useCallback(() => recRef.current?.stop(), []);

  return { supported, listening, interim, error, start, stop };
}
