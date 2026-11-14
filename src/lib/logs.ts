// 管理の画面の記録の形と、コピーする文の作り方。

/** 1 行の記録（表示とコピーに使う） */
export type LogRow = { id: string; at: string; kind: string; text: string; bad?: boolean };

/** 日時を「2026-11-14 21:05:33」の形にする（日本時間） */
export function stamp(iso: string) {
  return new Date(iso).toLocaleString("sv-SE", { timeZone: "Asia/Tokyo" });
}

/** コピーする文（1 行 1 件。本文の改行は字下げして続ける） */
export function rowsToText(rows: LogRow[]) {
  return rows.map((r) => `[${stamp(r.at)}] ${r.kind}: ${r.text.replace(/\n/g, "\n    ")}`).join("\n");
}
