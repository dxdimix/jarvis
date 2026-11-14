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
import { parseControl, parseWake, STOP_WORDS, type Control } from "@/lib/wake";

export type WakeState = "off" | "standby" | "command" | "busy" | "followup";

const WINDOW_MS = 8_000; // 呼ばれたあと、話しかけるのを待つ時間

export function useWakeWord(o: {
  enabled: boolean;
  speaking: boolean; // ディミが話している間は、止める言葉（ストップなど）だけを聞く
  paused?: boolean; // マイクのボタンで聞いている間など、こちらの聞き取りを止める
  isEcho?: (text: string) => boolean; // ディミ自身が話した声を拾ったものか（拾ったものは無視する）
  onWake: () => void; // 呼ばれた（「はい」と答える）
  onCommand: (text: string) => void; // 話しかけられた内容
  onControl: (c: Control) => void; // 終わり・聞かないで・取り消し
  volume?: number; // 合図の音の大きさ（0〜1。ディミの声の大きさと同じ）
  silenceMs?: number; // 話し終わりとみなすまでの無音の時間（既定 1.5 秒）。この間に続きを話せば、つなげて 1 つの発言にする
  followMs?: number; // 返事のあと、続けて話せる時間（0 なら続けて話せない。既定 8 秒）
}) {
  // 内部の状態。使わない設定のときは外には "off" と見せる（下の return）
  const [state, setStateRaw] = useState<WakeState>("standby");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState("");
  // 確かめる用: 実際に聞き取りが動いているか・最後に聞こえた言葉（設定の画面に出す）
  const [running, setRunning] = useState(false);
  const [lastHeard, setLastHeard] = useState("");
  const stateRef = useRef<WakeState>("standby");
  const liveRef = useRef(""); // 聞き取り途中の文字（話し終わりの合図で、待たずに送るため）
  const bufferRef = useRef(""); // 言い終わった部分をためておく（少し間が空いても、続きとつなげるため）
  const silenceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wokeAt = useRef(0);
  // ディミが話し終えてからしばらくは、まだ自分の声の聞き取り結果が遅れて届くので、話している間と同じに扱う
  const echoUntil = useRef(0);
  useEffect(() => {
    if (!o.speaking) echoUntil.current = Date.now() + 1200;
  }, [o.speaking]); // 呼ばれた時刻（自分の「はい」を聞き取ってしまったときに無視するため）
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
      const ms = s === "followup" ? (cb.current.followMs ?? WINDOW_MS) : WINDOW_MS;
      timerRef.current = setTimeout(() => {
        stateRef.current = "standby";
        setStateRaw("standby");
        setInterim("");
      }, ms);
    }
  }, []);

  // 呼ばれた: すぐに合図の音を鳴らし、「はい」と答える
  const wakeUp = useCallback(() => {
    wokeAt.current = Date.now();
    setState("command");
    chime(cb.current.volume ?? 1);
    cb.current.onWake();
  }, [setState]);

  // 話しかけられた内容を渡す（終わり・聞かないで・取り消しの合図なら、それを渡す）
  const submit = useCallback(
    (text: string) => {
      if (silenceRef.current) clearTimeout(silenceRef.current);
      silenceRef.current = null;
      bufferRef.current = "";
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

  // 話している間は待ち、無音が silenceMs 続いたら、ためた分をまとめて送る
  const armSilence = useCallback(() => {
    // 話している間は「8 秒黙ったら待機に戻る」を止める（長く話しても途切れないように）
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = null;
    if (silenceRef.current) clearTimeout(silenceRef.current);
    silenceRef.current = setTimeout(() => {
      silenceRef.current = null;
      const text = (bufferRef.current + liveRef.current).trim();
      if (text) submit(text);
    }, cb.current.silenceMs ?? 1500);
  }, [submit]);

  const handleFinal = useCallback(
    (raw: string) => {
      const s = stateRef.current;
      // 考えている間（返事を作っている・読み上げている間）は、止める言葉だけを受け付ける。
      // 「ディミ」も受け付けない（ディミが自分の名前を話したのを拾って、次の会話が始まってしまうため）
      if (s === "busy") {
        if (STOP_WORDS.test(raw) && !cb.current.isEcho?.(raw)) cb.current.onControl("stop");
        return;
      }
      // 自分の声を拾ったものは無視する
      if (s !== "standby" && cb.current.isEcho?.(raw)) return;
      // 呼ばれた直後に聞こえた「はい」は、ディミ自身の声なので無視する
      if (s === "command" && Date.now() - wokeAt.current < 2500 && /^(はい|ハイ)[。、！!]?$/.test(raw.trim())) return;
      const woke = parseWake(raw);
      let text = raw.trim();
      if (s === "standby") {
        if (woke === null) return; // 呼びかけでなければ無視
        if (woke === "") {
          wakeUp();
          return;
        }
        text = woke; // 「ディミ、FX を開いて」のように続けて言った
        stateRef.current = "command";
        setStateRaw("command");
      } else if (woke !== null) {
        if (woke === "") return; // 聞いている途中の「ディミ」は無視
        text = woke;
      }
      // すぐには送らず、ためておく（続きがあればつなげる）
      bufferRef.current += text;
      liveRef.current = "";
      armSilence();
    },
    [wakeUp, armSilence],
  );

  // ディミが話している間も聞き取りは止めない（「ストップ」で止められるように）。
  // 自分の声を拾ってしまうので、話している間は止める言葉だけを受け付ける（onresult の最初）。
  const paused = Boolean(o.paused);

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
      if ((cb.current.speaking || Date.now() < echoUntil.current) && stateRef.current !== "command") {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const t = e.results[i][0].transcript;
          if (STOP_WORDS.test(t) && !cb.current.isEcho?.(t)) {
            cb.current.onControl("stop");
            return;
          }
        }
        return;
      }
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) {
          setLastHeard(r[0].transcript);
          handleFinal(r[0].transcript);
        }
        else live += r[0].transcript;
      }
      liveRef.current = live;
      // 話している最中（聞き取り途中の文字が届いている間）は、話し終わりの待ち時間を数え直す
      if (live && (stateRef.current === "command" || stateRef.current === "followup")) armSilence();
      // 早く反応するため、言い終わるのを待たずに、聞き取り途中の文字が「ディミ」になった時点で応える
      const st = stateRef.current;
      if (st === "standby" && live && parseWake(live) === "") wakeUp();
      // 待機中は、聞き取った文字を画面に出さない（周りの会話を出さないため）
      setInterim(stateRef.current === "command" || stateRef.current === "followup" ? bufferRef.current + live : "");
    };
    rec.onstart = () => {
      setRunning(true);
      setError("");
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setError("マイクの使用が許可されていません。アドレス欄の左のアイコンから、マイクを許可してください。");
        stopped = true;
        cb.current.onControl("mute");
      } else if (e.error === "audio-capture") setError("マイクが見つかりません。");
      else if (e.error === "network") setError("音声認識の通信に失敗しました（自動でやり直します）。");
    };
    // ブラウザは無音が続くと聞き取りを止めるので、自動で再開する
    rec.onend = () => {
      setRunning(false);
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
      setRunning(false);
      recRef.current = null;
    };
  }, [o.enabled, paused, handleFinal, wakeUp, armSilence]);

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
      if (silenceRef.current) clearTimeout(silenceRef.current);
    },
    [],
  );

  const supported = typeof window !== "undefined" && getRecognitionClass() !== null;
  return {
    supported,
    running,
    lastHeard,
    state: (o.enabled && supported ? state : "off") as WakeState,
    interim,
    error,
    /** マイクのボタン: 「ディミ」と言わずに、すぐ話しかけられる状態にする */
    startCommand: useCallback(() => setState("command"), [setState]),
    /** 返事を言い終えたとき: 8 秒だけ続けて話せる状態にする */
    followUp: useCallback(() => {
      // 続けて話せる状態にする前に、聞き取り途中のもの（自分の声の残り）を捨てる
      bufferRef.current = "";
      liveRef.current = "";
      echoUntil.current = Math.max(echoUntil.current, Date.now() + 800);
      recRef.current?.abort(); // 聞き直す（止まったら自動で再開する）
      if (cb.current.followMs === 0) {
        if (stateRef.current === "busy") setState("standby");
      } else if (stateRef.current === "busy" || stateRef.current === "standby") setState("followup");
    }, [setState]),
    /** 話し終わりの合図（ボタンやキー）: ブラウザが言い終わりと判断するのを待たずに送る */
    finish: useCallback(() => {
      const heard = bufferRef.current + liveRef.current;
      const text = (parseWake(heard) ?? heard).trim();
      liveRef.current = "";
      // 聞き取り途中のものを捨てて聞き直す（同じ言葉が後から届いて二重に送られないように）
      recRef.current?.abort();
      if (text) submit(text);
      else setState("standby");
    }, [submit, setState]),
    /** 強制停止: ためていた言葉を捨て、続けて話せる時間もやめて、待機に戻す */
    reset: useCallback(() => {
      if (silenceRef.current) clearTimeout(silenceRef.current);
      silenceRef.current = null;
      bufferRef.current = "";
      liveRef.current = "";
      setInterim("");
      setState("standby");
    }, [setState]),
    /** 待機に戻す */
    standby: useCallback(() => setState("standby"), [setState]),
  };
}

// 呼ばれたときの短い合図の音（声の「はい」より先に、すぐ鳴る）
let audioCtx: AudioContext | null = null;
function chime(volume: number) {
  if (volume <= 0) return;
  try {
    audioCtx ??= new AudioContext();
    const t = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(880, t);
    osc.frequency.exponentialRampToValueAtTime(1320, t + 0.08);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, 0.12 * volume), t + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    osc.connect(gain).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + 0.2);
  } catch {}
}
