// 把 agent(含 @palserver/shared 與所有 npm 相依)打包成單一檔案,作為免安裝
// 執行檔(Node SEA)的基礎。cpu-features 是 ssh2 的可選原生加速模組(.node),
// 無法打包也非必要,標為 external;ssh2 沒有它會自動退回純 JS。dockerode 走本地
// socket,實務上不會用到 ssh2 的連線功能,但 docker-modem 會在載入時 require 它,
// 所以 ssh2 本身要打包進來(純 JS 部分)以免啟動即崩潰。
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

await build({
  entryPoints: [path.join(root, "packages/agent/dist/index.js")],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "cjs",
  outfile: path.join(root, "packages/agent/bundle/agent.cjs"),
  external: ["cpu-features"],
  logLevel: "info",
});

console.log("bundled → packages/agent/bundle/agent.cjs");
