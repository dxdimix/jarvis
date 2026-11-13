// PC のキーミス（K.Y.M.I.S）を、GitHub の main の最新版に自動で更新する。
// - 今入っている版（コミットの番号）は、アプリのフォルダの .version に書いておく（setup-windows.ps1 が最初に書く）。
// - 定期的に GitHub の main の番号を確かめ、違っていれば、会話していない時に入れ替える。
// - .version がないフォルダ（開発用の git の作業フォルダなど）では何もしない。

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const UA = { "User-Agent": "kymis-agent" };

export function readVersion(root) {
  try {
    return fs.readFileSync(path.join(root, ".version"), "utf8").trim() || null;
  } catch {
    return null;
  }
}

/** git の窓口の返事から、main の最新コミットの番号を取り出す。 */
export function parseMainSha(refsText) {
  const m = refsText.match(/([0-9a-f]{40}) refs\/heads\/main(?:\0|\n|$)/);
  return m ? m[1] : null;
}

/**
 * GitHub の main の最新コミットの番号。
 * GitHub の API は回数制限（1 時間 60 回、同じ出口の人と共用）があるため、git が使う窓口から調べる。
 */
export async function fetchLatestSha(repo) {
  const res = await fetch(`https://github.com/${repo}.git/info/refs?service=git-upload-pack`, {
    headers: { "User-Agent": "git/2.45 kymis-agent" },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`GitHub に問い合わせできませんでした（${res.status}）`);
  return parseMainSha(await res.text());
}

function readOrNull(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return null;
  }
}

/**
 * 指定した版をダウンロードして、root のファイルを入れ替える。
 * .env.local、node_modules、agent/workspace、agent/logs はダウンロードした中に含まれないので、そのまま残る。
 */
export async function applyUpdate({ root, repo, sha, log }) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kymis-update-"));
  try {
    const tarFile = path.join(tmp, "app.tar.gz");
    // github.com の URL を使う（リポジトリの名前を変えた後も、GitHub が新しい場所へ案内してくれる）。
    const res = await fetch(`https://github.com/${repo}/archive/${sha}.tar.gz`, {
      headers: UA,
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`ダウンロードに失敗しました（${res.status}）`);
    fs.writeFileSync(tarFile, Buffer.from(await res.arrayBuffer()));

    // Windows 10 以降にも tar コマンドが入っている。
    const out = path.join(tmp, "out");
    fs.mkdirSync(out);
    const tar = spawnSync("tar", ["-xzf", tarFile, "-C", out], { windowsHide: true, encoding: "utf8" });
    if (tar.status !== 0) throw new Error(`展開に失敗しました: ${(tar.stderr || tar.error?.message || "").slice(0, 200)}`);
    const [dir] = fs.readdirSync(out);
    const src = path.join(out, dir);
    if (!fs.existsSync(path.join(src, "agent", "index.mjs"))) throw new Error("ダウンロードした中身が想定と違います。");

    const lockBefore = readOrNull(path.join(root, "package-lock.json"));
    fs.cpSync(src, root, { recursive: true, force: true });
    const lockAfter = readOrNull(path.join(root, "package-lock.json"));

    if (lockBefore !== lockAfter) {
      log("部品の一覧が変わったので、部品を入れ直しています…");
      const npm = spawnSync("npm", ["install", "--no-audit", "--no-fund"], {
        cwd: root,
        shell: process.platform === "win32",
        windowsHide: true,
        encoding: "utf8",
      });
      if (npm.status !== 0) throw new Error(`部品の入れ直しに失敗しました: ${(npm.stderr || "").slice(-300)}`);
    }

    fs.writeFileSync(path.join(root, ".version"), sha);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

/** 候補のリポジトリを順に試し、最初に main の番号が取れたものを返す。 */
async function findLatest(repos) {
  let lastError = null;
  for (const repo of repos) {
    try {
      const sha = await fetchLatestSha(repo);
      if (sha) return { repo, sha };
    } catch (e) {
      lastError = e;
    }
  }
  if (lastError) throw lastError;
  return null;
}

/**
 * 定期的に更新を確かめる。更新できたら onUpdated を呼ぶ（呼ばれた側で起動し直す）。
 * @param {{ root: string, repos: string[], intervalMs: number, isIdle: () => boolean, log: (m: string) => void, onUpdated: (sha: string) => void }} o
 */
export function startAutoUpdate(o) {
  const current = readVersion(o.root);
  if (!current) return false;
  let latest = null;
  let latestRepo = null;
  let busy = false;

  async function tick() {
    if (busy) return;
    busy = true;
    try {
      if (!latest) {
        const found = await findLatest(o.repos);
        if (found && found.sha !== current) {
          latest = found.sha;
          latestRepo = found.repo;
          const sha = found.sha;
          o.log(`新しい版が見つかりました（${sha.slice(0, 7)}）。会話が途切れたら更新します。`);
        }
      }
      if (latest && o.isIdle()) {
        o.log("更新しています…");
        await applyUpdate({ root: o.root, repo: latestRepo, sha: latest, log: o.log });
        o.log(`更新しました（${current.slice(0, 7)} → ${latest.slice(0, 7)}）。起動し直します。`);
        o.onUpdated(latest);
      }
    } catch (e) {
      o.log(`自動更新できませんでした: ${e.message}`);
      latest = null; // 次の確認でやり直す
    } finally {
      busy = false;
    }
  }

  // 起動 1 分後に 1 回確かめ、その後は intervalMs ごと。新しい版を待っている間は 1 分ごとに会話の途切れを確かめる。
  setTimeout(tick, 60_000).unref();
  setInterval(() => {
    if (latest) tick();
  }, 60_000).unref();
  setInterval(() => {
    if (!latest) tick();
  }, o.intervalMs).unref();
  return true;
}
