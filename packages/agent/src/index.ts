#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import fastifyStatic from "@fastify/static";
import { ZodError } from "zod";
import { DATA_DIR, HOST, PORT, AGENT_VERSION, REQUIRE_TOKEN, WEB_ORIGINS, TLS_ENABLED } from "./env.js";
import {
  loadOrCreateToken,
  loadOrCreatePairingCode,
  makeAuthHook,
  isLoopback,
  type AuthContext,
} from "./auth.js";
import { loadOrCreateTlsCert } from "./tls.js";
import { InstanceStore } from "./store.js";
import { PresenceTracker } from "./presence.js";
import { BackupScheduler } from "./backup-scheduler.js";
import { RestartSupervisor } from "./supervisor.js";
import { fetchLatest } from "./version.js";
import { nativeDriver } from "./native.js";
import { dockerDriver } from "./docker.js";
import { registerRoutes } from "./routes.js";

// 啟動流程包在 async main() 內,讓 entry 沒有頂層 await —— 這樣才能打包成
// CommonJS 供 Node SEA 免安裝執行檔使用(頂層 await 只能輸出 ESM)。
async function main() {
const tls = TLS_ENABLED ? await loadOrCreateTlsCert() : null;
const scheme = tls ? "https" : "http";
const app = Fastify({
  logger: true,
  bodyLimit: 1024 * 1024 * 1024,
  ...(tls ? { https: { key: tls.key, cert: tls.cert } } : {}),
});
const token = loadOrCreateToken();
const pairingCode = loadOrCreatePairingCode();
const auth: AuthContext = { token, pairingCode, requireToken: REQUIRE_TOKEN };
const store = new InstanceStore();

// File uploads stream straight to disk (see PUT /files/upload), so hand the
// raw request through instead of buffering it into a body.
app.addContentTypeParser("application/octet-stream", (_req, _payload, done) => done(null, undefined));

// CORS 白名單:同源(合一版,通常不送 Origin)、本機各埠(含 dev server)、以及
// 設定允許的公開 web 站。跨源資料仍受 token/loopback 保護,收緊再擋一層。
await app.register(cors, {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // same-origin / 非瀏覽器 / 原生 app
    let host = "";
    try {
      host = new URL(origin).hostname;
    } catch {
      return cb(null, false);
    }
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return cb(null, true);
    if (WEB_ORIGINS.includes(origin)) return cb(null, true);
    cb(null, false);
  },
});
await app.register(websocket);

// Serve the built web UI when present.
const webDist = resolveWebDist();
if (webDist) {
  await app.register(fastifyStatic, {
    root: webDist,
    // index.html 不可快取,agent 更新後玩家瀏覽器才會立刻拿到新前端;
    // vite 產出的 JS/CSS 檔名帶雜湊,可交給瀏覽器長快取(靠 etag 重新驗證)。
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".html")) res.setHeader("Cache-Control", "no-cache");
    },
  });
}

app.setErrorHandler((err: Error & { statusCode?: number }, _req, reply) => {
  if (err instanceof ZodError) {
    reply.code(400).send({ error: err.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join("; ") });
    return;
  }
  const status = err.statusCode ?? 500;
  if (status >= 500) app.log.error(err);
  reply.code(status).send({ error: err.message });
});

app.addHook("onRequest", async (req, reply) => {
  if (!req.url.startsWith("/api/")) return;
  const routePath = req.url.split("?")[0];
  // 公開端點:偵測 agent(/api/info)與配對換發 token(/api/pair)本身不需授權。
  if (routePath === "/api/info" || routePath === "/api/pair") return;
  // 本機(loopback)免驗證,單機自用零摩擦;PALSERVER_REQUIRE_TOKEN=1 可關閉。
  if (!REQUIRE_TOKEN && isLoopback(req.ip)) return;
  await makeAuthHook(token)(req, reply);
});

// Warm the Steam version cache so the first instance listing already knows
// whether an update is available (it only ever reads the cache).
void fetchLatest().catch(() => {});

const presence = new PresenceTracker(store);
presence.start();

const scheduler = new BackupScheduler(store, (rec) =>
  rec.backend === "native" ? nativeDriver : dockerDriver,
);
scheduler.start();

const supervisor = new RestartSupervisor(store, (rec) =>
  rec.backend === "native" ? nativeDriver : dockerDriver,
);
supervisor.start();

registerRoutes(app, store, presence, scheduler, supervisor, auth);

await app.listen({ host: HOST, port: PORT });

app.log.info(`palserver-agent v${AGENT_VERSION} · data dir: ${DATA_DIR}`);
printStartupBanner(scheme, PORT, pairingCode, token);
}

void main();

/**
 * 找出要 serve 的 web/dist,支援三種執行情境:
 *  - PALSERVER_WEB_DIR 環境變數(明確指定)
 *  - 執行檔旁的 web/ 資料夾(免安裝 exe / SEA:release 內含 web/)
 *  - 相對於本模組的 ../../web/dist(開發時的 monorepo 佈局)
 * 都找不到就回 null(agent 只提供 API,不 serve 前端)。
 */
function resolveWebDist(): string | null {
  const candidates: string[] = [];
  if (process.env.PALSERVER_WEB_DIR) candidates.push(process.env.PALSERVER_WEB_DIR);
  candidates.push(path.join(path.dirname(process.execPath), "web"));
  try {
    candidates.push(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../web/dist"));
  } catch {
    /* 打包成 CJS 時 import.meta.url 為空,略過此候選 */
  }
  for (const c of candidates) {
    if (c && fs.existsSync(path.join(c, "index.html"))) return c;
  }
  return null;
}

/** 收集本機各網卡的 IPv4,標出可能是 Tailscale(100.64.0.0/10)的位址。 */
function localAddresses(): { ip: string; tailscale: boolean }[] {
  const out: { ip: string; tailscale: boolean }[] = [];
  for (const addrs of Object.values(os.networkInterfaces())) {
    for (const a of addrs ?? []) {
      if (a.family !== "IPv4" || a.internal) continue;
      const [x, y] = a.address.split(".").map(Number);
      out.push({ ip: a.address, tailscale: x === 100 && y >= 64 && y <= 127 });
    }
  }
  // Tailscale/VPN 位址排前面(最適合遠端連線)。
  return out.sort((a, b) => Number(b.tailscale) - Number(a.tailscale));
}

/** 玩家友善的啟動說明:本機直連、區網/VPN 位址、以及邀請朋友的一次性設定連結。 */
function printStartupBanner(proto: string, port: number, code: string, apiToken: string): void {
  const addrs = localAddresses();
  const remote = addrs[0]; // 優先 Tailscale/VPN,否則第一個區網位址
  const L = (s = "") => process.stdout.write(s + "\n");
  L();
  L("  ┌───────────────────────────────────────────────");
  L("  │  palserver GUI agent 已啟動 🐾");
  L("  │");
  L(`  │  本機管理(免密碼,直接打開):`);
  L(`  │      ${proto}://localhost:${port}`);
  if (addrs.length) {
    L("  │");
    L("  │  同一區網 / VPN 的裝置可連:");
    for (const a of addrs) L(`  │      ${proto}://${a.ip}:${port}${a.tailscale ? "   (Tailscale)" : ""}`);
  }
  L("  │");
  L("  │  邀請朋友遠端連線 —— 把這條連結傳給他:");
  if (remote) {
    L(`  │      ${proto}://${remote.ip}:${port}/?setup=${code}`);
  } else {
    L(`  │      (先連上 VPN 取得對外位址)，配對碼:${code}`);
  }
  L(`  │  或請對方在網頁輸入配對碼:${code}`);
  L("  │");
  L(`  │  進階/自動化用的 API token:${apiToken}`);
  if (proto === "https") L("  │  (自簽憑證:瀏覽器會跳安全警告,選「繼續前往」即可)");
  L("  └───────────────────────────────────────────────");
  L();
}
