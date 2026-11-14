"use client";

// 「ディミ」と呼ばれたときだけ反応する聞き取り。
// - standby: 「ディミ」だけを待つ（周りの会話には反応しない。聞き取った文字も画面に出さない）
// - command: 「はい」と答えたあと、話しかけられるのを待つ（8 秒）
// - busy: 返事を作っている間。「ディミ」と終わりの合図だけ受け付ける
// - followup: 返事を言い終えたあと 8 秒は、「ディミ」と言わずに続けて話せる
// ディミが話している間は、自分の声を拾わないように聞き取りを止める。
// 注意: ブラウザの音声認識は、聞き取った音声を Google / Microsoft のサーバーに送って文字にする。

import { useCallback, useEffect, useRef, useState } from "react";
import { getRecognitionClass, type Recognition } from "./useSpeechRecognition";
import { parseControl, parseWake, type Control } from "@/lib/wake";

export type WakeState = "off" | "standby" | "command" | "busy" | "followup";

const WINDOW_MS = 8_000; // 呼ばれたあと・返事のあとに、続けて話せる時間

export function useWakeWord(o: {
  enabled: boolean;
  speaking: boolean;
  onWake: () => void; // 呼ばれた（「はい」と答える）
  onCommand: (text: string) => void; // 話しかけられた内容
  onControl: (c: Control) => void; // 終わり・聞かないで・取り消し
}) {
  // 内部の状態。使わない設定のときは外には "off" と見せる（下の return）
  const [state, setStateRaw] = useState<WakeState>("standby");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  const stateRef = useRef<WakeState>("standby");
  const liveRef = useRef(""); // 聞き取り途中の文字（話し終わりの合図で、待たずに送るため）
  const wokeAt = useRef(0); // 呼ばれた時刻（自分の「はい」を聞き取ってしまったときに無視するため）
  const recRef = useRef<Recognition | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cb = useRef(o);
  useEffect(() => {
    cb.current = o;
  });

  const setState = useCallback((s: WakeState) => {
    stateRef.current = s;
    setStateRaw(s);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    // 呼ばれたあと・返事のあとは、8 秒黙っていたら待機に戻る
    if (s === "command" || s === "followup") {
      timerRef.current = setTimeout(() => {
        stateRef.current = "standby";
        setStateRaw("standby");
        setInterim("");
      }, WINDOW_MS);
    }
  }, []);

  // 呼ばれた: すぐに合図の音を鳴らし、「はい」と答える
  const wakeUp = useCallback(() => {
    wokeAt.current = Date.now();
    setState("command");
    chime();
    cb.current.onWake();
  }, [setState]);

  // 話しかけられた内容を渡す（終わり・聞かないで・取り消しの合図なら、それを渡す）
  const submit = useCallback(
    (text: string) => {
      liveRef.current = "";
      setInterim("");
      const control = parseControl(text);
      if (control) {
        setState("standby");
        cb.current.onControl(control);
        return;
      }
      setState("busy");
      cb.current.onCommand(text);
    },
    [setState],
  );

  const handleFinal = useCallback(
    (raw: string) => {
      const s = stateRef.current;
      // 呼ばれた直後に聞こえた「はい」は、ディミ自身の声なので無視する
      if (s === "command" && Date.now() - wokeAt.current < 2500 && /^(はい|ハイ)[。、！!]?$/.test(raw.trim())) return;
      const woke = parseWake(raw);
      let text = raw.trim();
      if (s === "standby" || s === "busy") {
        if (woke === null) return; // 呼びかけでなければ無視
        if (woke === "") {
          wakeUp();
          return;
        }
        text = woke; // 「ディミ、FX を開いて」のように続けて言った
      } else if (woke !== null) {
        if (woke === "") return; // 聞いている途中の「ディミ」は無視
        text = woke;
      }
      submit(text);
    },
    [wakeUp, submit],
  );

  // 「はい」と答えている間は聞き取りを止めない（止めると、続けて話した言葉を取りこぼすため）
  const paused = o.speaking && state !== "command";

  // 聞き取りの開始・停止（使う設定で、ディミが話していない間だけ聞く）
  useEffect(() => {
    const Cls = getRecognitionClass();
    if (!o.enabled || !Cls) return;
    if (paused) return; // 話している間は止める（下の片付けで止まる）

    let stopped = false;
    const rec = new Cls();
    rec.lang = "ja-JP";
    rec.interimResults = true;
    rec.continuous = true;
    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) handleFinal(r[0].transcript);
        else live += r[0].transcript;
      }
      liveRef.current = live;
      // 早く反応するため、言い終わるのを待たずに、聞き取り途中の文字が「ディミ」になった時点で応える
      const st = stateRef.current;
      if ((st === "standby" || st === "busy") && live && parseWake(live) === "") wakeUp();
      // 待機中は、聞き取った文字を画面に出さない（周りの会話を出さないため）
      setInterim(stateRef.current === "command" || stateRef.current === "followup" ? live : "");
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("マイクの使用が許可されていません。アドレス欄の左のアイコンから、マイクを許可してください。");
        stopped = true;
        cb.current.onControl("mute");
      }
    };
    // ブラウザは無音が続くと聞き取りを止めるので、自動で再開する
    rec.onend = () => {
      if (!stopped) setTimeout(() => !stopped && start(), 300);
    };
    const start = () => {
      try {
        rec.start();
      } catch {}
    };
    recRef.current = rec;
    start();
    return () => {
      stopped = true;
      rec.onend = null;
      rec.abort();
      recRef.current = null;
    };
  }, [o.enabled, paused, handleFinal, wakeUp]);

  // 使う設定をやめたら、次に使うときのために待機に戻しておく
  useEffect(() => {
    if (o.enabled) return;
    return () => {
      stateRef.current = "standby";
    };
  }, [o.enabled]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const supported = typeof window !== "undefined" && getRecognitionClass() !== null;
  return {
    supported,
    state: (o.enabled && supported ? state : "off") as WakeState,
    interim,
    error,
    /** マイクのボタン: 「ディミ」と言わずに、すぐ話しかけられる状態にする */
    startCommand: useCallback(() => setState("command"), [setState]),
    /** 返事を言い終えたとき: 8 秒だけ続けて話せる状態にする */
    followUp: useCallback(() => {
      if (stateRef.current === "busy" || stateRef.current === "standby") setState("followup");
    }, [setState]),
    /** 話し終わりの合図（ボタンやキー）: ブラウザが言い終わりと判断するのを待たずに送る */
    finish: useCallback(() => {
      const text = (parseWake(liveRef.current) ?? liveRef.current).trim();
      liveRef.current = "";
      // 聞き取り途中のものを捨てて聞き直す（同じ言葉が後から届いて二重に送られないように）
      recRef.current?.abort();
      if (text) submit(text);
      else setState("standby");
    }, [submit, setState]),
    /** 待機に戻す */
    standby: useCallback(() => setState("standby"), [setState]),
  };
}

// 呼ばれたときの短い合図の音（声の「はい」より先に、すぐ鳴る）
let audioCtx: AudioContext | null = null;
function chime() {
  try {
    audioCtx ??= new AudioContext();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.08);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.12, t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  } catch {}
}
