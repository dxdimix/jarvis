// 呼びかけ（「ディミ」）と、終わりの合図の判定。聞き取った文字だけを見る。

// 「ディミ」の聞き間違えも、呼びかけとして受け付ける（使いながら足していく）。
// 短い言葉は前後に別の言葉が付いて聞き取られることがあるので、文の頭でなくても見つける。
const WAKE =
  /(ねぇ|ねえ|ねー|おい|ヘイ|hey)?[、,\s]*(ディーミー|ディーミ|ディミー|ディミィ|ディミ|でぃーみ|でぃみー?|ディム|ティミー?|ジミー|ジミ|じみー?|デミー?|リミ|りみ|dimy|dimi|dimmy|demi|jimmy|timmy)(さん|ちゃん)?[、,。.!！?？\s]*/i;

/** 呼びかけで始まっていれば、そのあとの言葉（呼びかけだけなら空文字）。呼びかけでなければ null */
export function parseWake(text: string): string | null {
  const t = text.trim();
  const m = WAKE.exec(t);
  if (!m) return null;
  return t.slice(m.index + m[0].length).trim();
}

export type Control = "end" | "mute" | "cancel" | "stop";

/** 強制停止の言葉（ディミが話している間・考えている間は、文の途中に入っていても受け付ける） */
export const STOP_WORDS = /(ストップ|すとっぷ|stop|止めて|とめて|止まって|とまって|黙って|だまって|静かに|しずかに|強制終了|中止)/i;

/** 終わり・聞かないで・取り消しの合図なら、その種類。普通の話なら null */
export function parseControl(text: string): Control | null {
  const t = text.replace(/[、。,.!！?？\s]/g, "");
  if (/^(ストップ|すとっぷ|stop|止めて|とめて|止まって|とまって|やめて|黙って|だまって|静かに|しずかに|強制終了|中止|全部止めて)$/i.test(t)) return "stop";
  if (/^(マイク(を)?(オフ|切って|止めて)|聞かないで|きかないで|聞くのをやめて|もう聞かないで)/.test(t)) return "mute";
  if (/^(取り消し|とりけし|違う|ちがう|キャンセル|やっぱりいい)$/.test(t)) return "cancel";
  if (/^(終わり|おわり|終了|しゅうりょう|もういい|もう大丈夫|大丈夫|ありがとう|ありがとうございます|以上)$/.test(t)) return "end";
  return null;
}

/**
 * 読み上げる前に、読み方を整える。
 * - 英字の名前を読みやすく（DIMY → ディミ など）
 * - URL や記号は読まない
 */
export function toSpeech(text: string): string {
  return text
    .replace(/https?:\/\/\S+/g, "")
    .replace(/\bDIMY\b/gi, "ディミ")
    .replace(/\bFX\b/g, "エフエックス")
    .replace(/\bGMO\b/g, "ジーエムオー")
    .replace(/\bUMSheet\b/gi, "ユーエムシート")
    .replace(/[*#＊＃`|｜>]/g, "")
    .replace(/^\s*[・\-]\s*/gm, "")
    .replace(/\n+/g, "。")
    .replace(/。{2,}/g, "。")
    .trim();
}

/**
 * 聞こえた言葉が、ディミ自身がさっき話した声（スピーカーの音をマイクが拾ったもの）かどうか。
 * 2 文字ずつの組み合わせが、話した文の中に半分以上あれば、自分の声とみなす。
 */
export function isEcho(heard: string, spoken: string): boolean {
  const norm = (t: string) => t.replace(/[、。,.!！?？「」『』（）()\s・ー]/g, "").toLowerCase();
  const h = norm(heard);
  const sp = norm(spoken);
  if (!h || !sp) return false;
  if (h.length < 3) return sp.includes(h);
  let hit = 0;
  for (let i = 0; i < h.length - 1; i++) if (sp.includes(h.slice(i, i + 2))) hit++;
  return hit / (h.length - 1) >= 0.5;
}
