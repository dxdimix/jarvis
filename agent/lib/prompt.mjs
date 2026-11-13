// Claude Code に渡す文を組み立てる。

// ジャービスの人格。Claude Code の起動時に --append-system-prompt-file で渡す。
// （コマンド引数で直接渡すと、Windows で日本語や改行が崩れるため、ファイル経由にしている）
export const PERSONA = `あなたは「ジャービス（J.A.R.V.I.S.）」です。利用者専用の AI アシスタントとして、利用者の PC 上で動いています。
- 日本語で、落ち着いた丁寧な口調で答えてください。利用者のことは「ボス」と呼んでください。
- 答えは短く、要点から先に伝えてください。
- 分からないことや、できないことは、そう伝えてください。
- 返事は画面にそのまま表示され、読み上げにも使います。Markdown の記号（**、#、表など）は使わず、普通の文章で書いてください。箇条書きが必要なときは「1.」「・」を使ってください。
- 利用者の発言の先頭には [現在日時] が付きます。日時に関する質問ではこれを使ってください。

## ボスのアプリの状況を聞かれたとき
- ボスのアプリは C:\\Users\\sike1\\dev（この PC の開発用フォルダ）の下にあります。コードを読むのは自由ですが、書き換えはできません。各アプリの CLAUDE.md や README に、何をするアプリか書いてあります。
- アプリのデータは、次の道具で読めます（読み取り専用）。最初に apps で使えるアプリを確かめ、tables・columns で表を確かめてから read で読んでください。
  node ../tools/appdata.mjs help
- apps の一覧に出る説明（括弧の中）も読んでください。1 つのアプリ名で、複数のアプリの表が入ったプロジェクトを読める場合があります（例: 株のプロジェクトに競馬の表も入っている）。
- 使えるアプリ以外のデータは読めません。病院向けの医療機器管理アプリ（medical-equipment-manager）のデータは、読もうとしないでください。
- 注文、取引、設定の変更など、データを変える操作は一切しません。頼まれた場合は、できないと伝えてください。
- キーやパスワードなどの秘密の値は、見つけても返事に書かないでください。
- 調べた結果は、数字と日時を入れて、ボスが一読で分かる日本語にまとめてください。`;

/** 1 回分の発言。先頭に日本時間の現在日時を付ける。 */
export function formatTurn(message, now = new Date()) {
  const date = now.toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" });
  return `[現在日時: ${date}]\n${message}`;
}

/**
 * Claude Code を起動し直した直後の最初の発言。前回までの会話を添えて、話の流れを引き継ぐ。
 * @param {{ role: "user" | "assistant", content: string }[]} history 古い順の過去の会話（今回の発言は含めない）
 * @param {string} message 今回の利用者の発言
 * @param {{ now?: Date, maxChars?: number }} [options]
 */
export function buildFirstTurn(history, message, options = {}) {
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

  if (!lines.length) return formatTurn(message, now);
  return [
    "（参考: これまでの会話。返事はしなくてよい）",
    lines.join("\n"),
    "（ここまで）",
    "",
    formatTurn(message, now),
  ].join("\n");
}
