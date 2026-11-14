// 呼びかけ（「ディミ」）と、終わりの合図の判定。聞き取った文字だけを見る。

// 「ディミ」の聞き間違えも、呼びかけとして受け付ける（使いながら足していく）
const WAKE = /^(ねぇ|ねえ|ねー|おい|ヘイ|hey)?[、,\s]*(ディミー?|でぃみー?|ディミィ|ディーミ|でぃーみ|ディム|ディミ|リミ|りみ|デミ|でみ|dimy|dimi|demi)(さん|ちゃん)?[、,。.!！?？\s]*/i;

/** 呼びかけで始まっていれば、そのあとの言葉（呼びかけだけなら空文字）。呼びかけでなければ null */
export function parseWake(text: string): string | null {
  const t = text.trim();
  const m = t.match(WAKE);
  if (!m) return null;
  return t.slice(m[0].length).trim();
}

export type Control = "end" | "mute" | "cancel";

/** 終わり・聞かないで・取り消しの合図なら、その種類。普通の話なら null */
export function parseControl(text: string): Control | null {
  const t = text.replace(/[、。,.!！?？\s]/g, "");
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
