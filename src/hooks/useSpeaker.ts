"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { pickJapaneseVoice } from "@/lib/speech";

export const DEFAULT_RATE = 1.1;
export const DEFAULT_PITCH = 1;
export const DEFAULT_VOLUME = 1;

/**
 * ブラウザの読み上げ機能（speechSynthesis）で返事を声にする。無料。OS やブラウザに入っている声を使う。
 * 文ごとに speak() を呼ぶと順番に読み上げ、全部読み終えたら onIdle を呼ぶ。
 */
export function useSpeaker(
  onIdle: () => void,
  initial: { voiceName?: string | null; rate?: number; pitch?: number; volume?: number } = {},
) {
  const supported = typeof window !== "undefined" && "speechSynthesis" in window;
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [voiceName, setVoiceName] = useState<string | null>(initial.voiceName ?? null);
  // 話す速さ（0.7〜1.6）と声の高さ（0.7〜1.4）
  const [rate, setRate] = useState(initial.rate ?? DEFAULT_RATE);
  const [pitch, setPitch] = useState(initial.pitch ?? DEFAULT_PITCH);
  // ディミの声の大きさ（0〜1）。PC 全体の音量とは別に決める（PC の音量より大きくはできない）
  const [volume, setVolume] = useState(
    initial.volume !== undefined && Number.isFinite(initial.volume) ? Math.min(1, Math.max(0, initial.volume)) : DEFAULT_VOLUME,
  );
  const queued = useRef(0);
  // 読み上げ中の文を持っておく（持っていないと、Chrome が途中で捨てて「読み終わった」の知らせが来ないことがある）
  const live = useRef(new Set<SpeechSynthesisUtterance>());
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
      u.rate = rate;
      u.pitch = pitch;
      u.volume = volume;
      queued.current++;
      setSpeaking(true);
      live.current.add(u);
      const done = () => {
        if (!live.current.delete(u)) return; // 同じ文の知らせが 2 回来たときは数えない
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
    [supported, voice, rate, pitch, volume],
  );

  const cancel = useCallback(() => {
    if (!supported) return;
    queued.current = 0;
    live.current.clear();
    setSpeaking(false);
    window.speechSynthesis.cancel();
  }, [supported]);

  // 見張り: ブラウザがもう何も読んでいないのに「読み上げ中」のままなら、読み終わったことにする
  // （「読み上げ中」のままだと、呼びかけの聞き取りがずっと止まってしまうため）
  useEffect(() => {
    if (!supported || !speaking) return;
    let quiet = 0;
    const t = setInterval(() => {
      const ss = window.speechSynthesis;
      quiet = ss.speaking || ss.pending ? 0 : quiet + 1;
      if (quiet >= 2 && queued.current > 0) {
        queued.current = 0;
        live.current.clear();
        setSpeaking(false);
        onIdleRef.current();
      }
    }, 1000);
    return () => clearInterval(t);
  }, [supported, speaking]);

  const isSpeaking = useCallback(() => queued.current > 0, []);

  return { supported, speak, cancel, isSpeaking, speaking, japaneseVoices, voiceName: voice?.name ?? null, setVoiceName, rate, setRate, pitch, setPitch, volume, setVolume };
}
