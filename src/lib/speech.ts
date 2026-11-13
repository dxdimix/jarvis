// 読み上げ用の文の切り出し。返事が少しずつ届く間も、書き終わった文から順に読み上げるために使う。

const SENTENCE_END = /[。！？!?\n]/;

/**
 * text の from 文字目以降から、読み上げてよい部分を取り出す。
 * - 返事の途中（final = false）: 最後の文の区切り（。！？ や改行）までを返す。区切りがなければ何も返さない。
 * - 返事の完了後（final = true）: 残りを全部返す。
 * @returns chunk: 読み上げる文（前後の空白は除く）、next: 次に読み始める位置
 */
export function takeSpeakable(text: string, from: number, final: boolean): { chunk: string; next: number } {
  if (from >= text.length) return { chunk: "", next: from };
  let end = text.length;
  if (!final) {
    end = -1;
    for (let i = text.length - 1; i >= from; i--) {
      if (SENTENCE_END.test(text[i])) {
        end = i + 1;
        break;
      }
    }
    if (end === -1) return { chunk: "", next: from };
  }
  return { chunk: text.slice(from, end).trim(), next: end };
}

/** 日本語の声の中から、キーミスらしい落ち着いた男性の声を優先して選ぶ。 */
export function pickJapaneseVoice(voices: SpeechSynthesisVoice[], preferredName?: string | null) {
  const ja = voices.filter((v) => v.lang.replace("_", "-").toLowerCase().startsWith("ja"));
  if (preferredName) {
    const found = ja.find((v) => v.name === preferredName);
    if (found) return found;
  }
  return ja.find((v) => /Keita|Ichiro|Otoya|Daichi|Naoki|男性|Male/i.test(v.name)) ?? ja[0] ?? null;
}
