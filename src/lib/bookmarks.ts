// Chrome のブックマーク（PC のディミが写したもの）を、声で探す。

export type Bookmark = { title: string; url: string; folder: string };

const OPEN = /(を)?(開いて|ひらいて|開けて|表示して|見せて|出して|起動して|開く)/;
const norm = (s: string) => s.toLowerCase().replace(/[\s　・\-_/|｜:：「」『』]/g, "");

/** 「経費精算を開いて」の「経費精算」の部分（開く言葉がなければ null） */
export function openTarget(text: string): string | null {
  const t = text.trim();
  const m = t.match(OPEN);
  if (!m || m.index === undefined) return null;
  const target = norm(t.slice(0, m.index).replace(/(の画面|のページ|のサイト|のブックマーク)$/, ""));
  return target || null;
}

/** 言われた名前に合うブックマーク。いくつも合うときは、名前がいちばん短いもの */
export function matchBookmark(text: string, list: Bookmark[]): Bookmark | null {
  const target = openTarget(text);
  if (!target || target.length < 2) return null;
  const hits = list.filter((b) => {
    const title = norm(b.title);
    return title.includes(target) || (title.length >= 2 && target.includes(title));
  });
  if (!hits.length) return null;
  return hits.reduce((a, b) => (norm(b.title).length < norm(a.title).length ? b : a));
}
