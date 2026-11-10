// Claude Code に渡す依頼文を組み立てる。
// システムプロンプトをコマンド引数で渡すと Windows で日本語や改行が崩れるため、全部を標準入力で渡す。

export const PERSONA = `あなたは「ジャービス（J.A.R.V.I.S.）」です。利用者専用の AI アシスタントとして、利用者の PC 上で動いています。
- 日本語で、落ち着いた丁寧な口調で答えてください。利用者のことは「ボス」と呼んでください。
- 答えは短く、要点から先に伝えてください。
- 分からないことや、できないことは、そう伝えてください。`;

/**
 * @param {{ role: "user" | "assistant", content: string }[]} history 古い順の過去の会話（今回の発言は含めない）
 * @param {string} message 今回の利用者の発言
 * @param {{ now?: Date, maxChars?: number }} [options]
 */
export function buildPrompt(history, message, options = {}) {
  const now = options.now ?? new Date();
  const maxChars = options.maxChars ?? 12000;

  // 新しい発言から順に、文字数の上限まで履歴を入れる。
  const lines = [];
  let total = 0;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    const line = `${h.role === "user" ? "ボス" : "ジャービス"}: ${h.content}`;
    if (total + line.length > maxChars) break;
    lines.unshift(line);
    total += line.length;
  }

  const date = now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  return [
    PERSONA,
    "",
    `現在日時（日本時間）: ${date}`,
    "",
    "## これまでの会話",
    lines.length ? lines.join("\n") : "（なし）",
    "",
    "## ボスの今回の発言",
    message,
    "",
    "ジャービスとしての返事だけを出力してください。",
  ].join("\n");
}
