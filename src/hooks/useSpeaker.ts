"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pickJapaneseVoice } from "@/lib/speech";

/**
 * ブラウザの読み上げ機能（speechSynthesis）で返事を声にする。無料。OS やブラウザに入っている声を使う。
 * 文ごとに speak() を呼ぶと順番に読み上げ、全部読み終えたら onIdle を呼ぶ。
 */
export function useSpeaker(onIdle: () => void, initialVoiceName: string | null = null) {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState<string | null>(initialVoiceName);
  const queued = useRef(0);
  // 読み上げ中かどうか（画面の動きに使う）
  const [speaking, setSpeaking] = useState(false);
  const onIdleRef = useRef(onIdle);
  useEffect(() => {
    onIdleRef.current = onIdle;
  }, [onIdle]);

  useEffect(() => {
    if (!supported) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.addEventListener("voiceschanged", load);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", load);
  }, [supported]);

  const japaneseVoices = voices.filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith("ja"));
  const voice = pickJapaneseVoice(voices, voiceName);

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "ja-JP";
      if (voice) u.voice = voice;
      u.rate = 1.1;
      queued.current++;
      setSpeaking(true);
      const done = () => {
        queued.current = Math.max(0, queued.current - 1);
        if (queued.current === 0) {
          setSpeaking(false);
          onIdleRef.current();
        }
      };
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
    },
    [supported, voice],
  );

  const cancel = useCallback(() => {
    if (!supported) return;
    queued.current = 0;
    setSpeaking(false);
    window.speechSynthesis.cancel();
  }, [supported]);

  const isSpeaking = useCallback(() => queued.current > 0, []);

  return { supported, speak, cancel, isSpeaking, speaking, japaneseVoices, voiceName: voice?.name ?? null, setVoiceName };
}
