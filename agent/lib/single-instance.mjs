// 常駐プログラムが二重に起動しないようにする。
// Windows では名前付きパイプ、それ以外では Unix ソケットを「使用中の札」にする。
// プロセスが終われば札は自動で外れるので、PC が落ちた後でも次の起動を邪魔しない。

import fs from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";

function listen(address) {
  return new Promise((resolve, reject) => {
    const server = net.createServer((socket) => socket.end());
    server.once("error", reject);
    server.listen(address, () => {
      server.unref();
      resolve(server);
    });
  });
}

function canConnect(address) {
  return new Promise((resolve) => {
    const c = net.connect(address);
    c.once("connect", () => {
      c.destroy();
      resolve(true);
    });
    c.once("error", () => resolve(false));
  });
}

/** 札を取れたら true。すでに別の常駐プログラムが動いていたら false。 */
export async function acquireSingleInstance(name) {
  const address =
    process.platform === "win32" ? `\\\\.\\pipe\\${name}` : path.join(os.tmpdir(), `${name}.sock`);
  try {
    await listen(address);
    return true;
  } catch (e) {
    if (e.code !== "EADDRINUSE") throw e;
  }
  if (process.platform === "win32") return false;
  // Unix では前回の札（ソケットファイル）が残っていることがある。誰も応答しなければ消して取り直す。
  if (await canConnect(address)) return false;
  fs.rmSync(address, { force: true });
  await listen(address);
  return true;
}
