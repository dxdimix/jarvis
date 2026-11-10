import { describe, expect, it } from "vitest";
import { parseMainSha } from "../agent/lib/updater.mjs";

describe("parseMainSha", () => {
  const a = "5dd82da41ab7508c602f173fa7c765b11f86232b";
  const b = "6839e79ccc92ce097a4bdb8670dfaf01c495b480";

  it("git の窓口の返事から main の番号を取り出す", () => {
    const text = `001e# service=git-upload-pack\n0000015${b} HEAD\0multi_ack thin-pack\n003d${a} refs/heads/main\n003f${b} refs/heads/feature\n0000`;
    expect(parseMainSha(text)).toBe(a);
  });

  it("main という名前で始まる別のブランチと取り違えない", () => {
    expect(parseMainSha(`003d${b} refs/heads/main-old\n0000`)).toBeNull();
  });

  it("main がなければ null", () => {
    expect(parseMainSha("0000")).toBeNull();
  });
});
