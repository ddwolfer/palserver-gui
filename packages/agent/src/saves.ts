import fs from "node:fs";
import path from "node:path";
import { execFile, spawn } from "node:child_process";
import type { Readable } from "node:stream";
import { promisify } from "node:util";
import type { BackupInfo, SavesStatus, WorldSave } from "@palserver/shared";
import type { DriverContext } from "./driver.js";
import type { InstanceRecord } from "./store.js";
import { serverRoot } from "./native.js";
import { rest } from "./restapi.js";

const execFileP = promisify(execFile);

/**
 * 「輕量可攜」匯出/複製要帶的東西:世界存檔 + ini 設定 + PalDefender 設定,
 * 刻意排除可重新下載的遊戲執行檔(數十 GB)。路徑相對於 serverRoot,一律用
 * 正斜線 —— tar 與 Node fs 在 Windows 也都吃正斜線。 */
const PORTABLE_PATHS = [
  "Pal/Saved/SaveGames",
  "Pal/Saved/Config",
  "Pal/Binaries/Win64/PalDefender/Config.json",
];

/** 存在於此 serverRoot 底下的可攜路徑(相對)。 */
function existingPortablePaths(root: string): string[] {
  return PORTABLE_PATHS.filter((p) => fs.existsSync(path.join(root, p)));
}

/** 匯出成 tar.gz 的可讀串流(存檔+設定,不含遊戲執行檔);沒東西可匯出時回 null。 */
export function exportArchiveStream(rec: InstanceRecord, ctx: DriverContext): Readable | null {
  const root = serverRoot(rec, ctx);
  const rel = existingPortablePaths(root);
  if (rel.length === 0) return null;
  const child = spawn("tar", ["-czf", "-", "-C", root, ...rel], { windowsHide: true });
  child.on("error", () => {}); // tar 不在時別讓它變成未捕捉例外;串流會提前結束
  return child.stdout;
}

/** 把來源的存檔+設定複製到新實例的 serverRoot(複製伺服器用,不含遊戲執行檔)。 */
export function copyPortableData(srcRoot: string, destRoot: string): void {
  for (const rel of existingPortablePaths(srcRoot)) {
    const from = path.join(srcRoot, rel);
    const to = path.join(destRoot, rel);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.cpSync(from, to, { recursive: true });
  }
}

/**
 * World-save and backup management.
 *
 * Layout: <server>/Pal/Saved/SaveGames/0/<WorldGUID>/{Level.sav, Players/*.sav, …}
 * The server picks which world to load from `DedicatedServerName` in
 * GameUserSettings.ini — a mismatch there is the classic migration failure,
 * so we read it, show it, and can set it.
 *
 * Backups are tar.gz archives under <instanceDir>/backups. tar ships with
 * Windows 10+, macOS and Linux, so no archive dependency is needed.
 */

const CONFIG_PLATFORM_DIR = process.platform === "win32" ? "WindowsServer" : "LinuxServer";

function fail(message: string, statusCode = 400): Error & { statusCode: number } {
  return Object.assign(new Error(message), { statusCode });
}

const saveGamesDir = (root: string) => path.join(root, "Pal", "Saved", "SaveGames", "0");
const backupsDir = (ctx: DriverContext) => path.join(ctx.instanceDir, "backups");
const gameUserSettings = (root: string) =>
  path.join(root, "Pal", "Saved", "Config", CONFIG_PLATFORM_DIR, "GameUserSettings.ini");

function requireNative(rec: InstanceRecord): void {
  if (rec.backend !== "native") throw fail("存檔管理目前僅支援原生模式的實例", 409);
}

export const serverRootOf = (rec: InstanceRecord, ctx: DriverContext) => serverRoot(rec, ctx);

/** Delete the oldest backups of a world beyond `keep`. Returns removed names. */
export function pruneBackups(ctx: DriverContext, worldGuid: string, keep: number): string[] {
  const stale = listBackups(ctx)
    .filter((b) => b.worldGuid === worldGuid)
    .slice(keep); // listBackups is newest-first
  for (const backup of stale) {
    fs.rmSync(path.join(backupsDir(ctx), backup.name), { force: true });
  }
  return stale.map((b) => b.name);
}

function dirSize(dir: string): number {
  let total = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) total += dirSize(full);
    else total += fs.statSync(full, { throwIfNoEntry: false })?.size ?? 0;
  }
  return total;
}

/** The world the server will load, per GameUserSettings.ini. */
export function activeWorldGuid(root: string): string | null {
  try {
    const ini = fs.readFileSync(gameUserSettings(root), "utf8");
    const match = /^DedicatedServerName\s*=\s*(.*)$/m.exec(ini);
    const value = match?.[1]?.trim();
    return value ? value : null;
  } catch {
    return null;
  }
}

/** Point the server at a world. Creates the key/section if missing. */
export function setActiveWorldGuid(root: string, guid: string): void {
  const file = gameUserSettings(root);
  if (!fs.existsSync(file)) {
    throw fail("找不到 GameUserSettings.ini — 請先啟動一次伺服器讓它生成", 409);
  }
  if (!fs.existsSync(path.join(saveGamesDir(root), guid))) {
    throw fail(`找不到世界存檔 ${guid}`, 404);
  }
  let ini = fs.readFileSync(file, "utf8");
  if (/^DedicatedServerName\s*=.*$/m.test(ini)) {
    ini = ini.replace(/^DedicatedServerName\s*=.*$/m, `DedicatedServerName=${guid}`);
  } else if (/^\[\/Script\/Pal\.PalGameLocalSettings\]/m.test(ini)) {
    ini = ini.replace(
      /^\[\/Script\/Pal\.PalGameLocalSettings\]/m,
      `[/Script/Pal.PalGameLocalSettings]\nDedicatedServerName=${guid}`,
    );
  } else {
    ini += `\n[/Script/Pal.PalGameLocalSettings]\nDedicatedServerName=${guid}\n`;
  }
  fs.writeFileSync(file, ini);
}

function listWorlds(root: string): WorldSave[] {
  const dir = saveGamesDir(root);
  if (!fs.existsSync(dir)) return [];
  const active = activeWorldGuid(root);
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => {
      const full = path.join(dir, e.name);
      const playersDir = path.join(full, "Players");
      const players = fs.existsSync(playersDir)
        ? fs.readdirSync(playersDir).filter((f) => f.toLowerCase().endsWith(".sav"))
        : [];
      return {
        guid: e.name,
        active: e.name === active,
        sizeBytes: dirSize(full),
        modifiedAt: new Date(fs.statSync(full).mtimeMs).toISOString(),
        playerSaves: players.map((f) => ({
          file: f,
          playerUid: path.basename(f, path.extname(f)),
          sizeBytes: fs.statSync(path.join(playersDir, f)).size,
        })),
      } satisfies WorldSave;
    })
    .sort((a, b) => Number(b.active) - Number(a.active) || b.modifiedAt.localeCompare(a.modifiedAt));
}

function listBackups(ctx: DriverContext): BackupInfo[] {
  const dir = backupsDir(ctx);
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".tar.gz"))
    .map((name) => {
      const stat = fs.statSync(path.join(dir, name));
      // <guid>__<iso-ish timestamp>.tar.gz
      const [guid] = name.replace(/\.tar\.gz$/, "").split("__");
      return {
        name,
        worldGuid: guid ?? "",
        sizeBytes: stat.size,
        createdAt: new Date(stat.mtimeMs).toISOString(),
      } satisfies BackupInfo;
    })
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Everything but the schedule, which the scheduler owns and routes merges in. */
export function getSavesStatus(
  rec: InstanceRecord,
  ctx: DriverContext,
): Omit<SavesStatus, "schedule"> {
  if (rec.backend !== "native") {
    return { supported: false, reason: "存檔管理目前僅支援原生模式的實例", worlds: [], backups: [] };
  }
  const root = serverRoot(rec, ctx);
  if (!fs.existsSync(saveGamesDir(root))) {
    return {
      supported: false,
      reason: "尚未產生世界存檔 — 先啟動一次伺服器",
      worlds: [],
      backups: listBackups(ctx),
    };
  }
  return { supported: true, worlds: listWorlds(root), backups: listBackups(ctx) };
}

/** Ask the running server to flush the world first, so the archive isn't
 * a snapshot of half-written state. Silently skipped when REST is off. */
async function flushWorld(rec: InstanceRecord): Promise<boolean> {
  try {
    await rest.save(rec);
    return true;
  } catch {
    return false;
  }
}

export async function createBackup(
  rec: InstanceRecord,
  ctx: DriverContext,
  worldGuid: string,
): Promise<BackupInfo> {
  requireNative(rec);
  const root = serverRoot(rec, ctx);
  const worldDir = path.join(saveGamesDir(root), worldGuid);
  if (!fs.existsSync(worldDir)) throw fail(`找不到世界存檔 ${worldGuid}`, 404);

  const flushed = await flushWorld(rec);
  fs.mkdirSync(backupsDir(ctx), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = `${worldGuid}__${stamp}.tar.gz`;
  const archive = path.join(backupsDir(ctx), name);
  await execFileP("tar", ["-czf", archive, "-C", worldDir, "."], { windowsHide: true });

  return {
    name,
    worldGuid,
    sizeBytes: fs.statSync(archive).size,
    createdAt: new Date().toISOString(),
    flushedBeforeBackup: flushed,
  };
}

export async function restoreBackup(
  rec: InstanceRecord,
  ctx: DriverContext,
  backupName: string,
  running: boolean,
): Promise<{ worldGuid: string; safetyBackup: string }> {
  requireNative(rec);
  if (running) throw fail("請先停止伺服器再還原存檔", 409);

  const archive = path.join(backupsDir(ctx), path.basename(backupName));
  if (!archive.endsWith(".tar.gz") || !fs.existsSync(archive)) throw fail("找不到備份檔", 404);

  const worldGuid = path.basename(backupName).replace(/\.tar\.gz$/, "").split("__")[0];
  if (!worldGuid) throw fail("備份檔名無法解析出世界 GUID");

  const root = serverRoot(rec, ctx);
  const worldDir = path.join(saveGamesDir(root), worldGuid);

  // Never destroy the current world without keeping a copy of it first.
  let safetyBackup = "(無現有存檔,略過)";
  if (fs.existsSync(worldDir)) {
    safetyBackup = (await createBackup(rec, ctx, worldGuid)).name;
    fs.rmSync(worldDir, { recursive: true, force: true });
  }
  fs.mkdirSync(worldDir, { recursive: true });
  await execFileP("tar", ["-xzf", archive, "-C", worldDir], { windowsHide: true });
  return { worldGuid, safetyBackup };
}

export function deleteBackup(ctx: DriverContext, backupName: string): void {
  const archive = path.join(backupsDir(ctx), path.basename(backupName));
  if (!archive.endsWith(".tar.gz") || !fs.existsSync(archive)) throw fail("找不到備份檔", 404);
  fs.rmSync(archive);
}

export function backupPath(ctx: DriverContext, backupName: string): string {
  const archive = path.join(backupsDir(ctx), path.basename(backupName));
  if (!archive.endsWith(".tar.gz") || !fs.existsSync(archive)) throw fail("找不到備份檔", 404);
  return archive;
}

/** Remove one player's save. The player rejoins as a fresh character. */
export function deletePlayerSave(
  rec: InstanceRecord,
  ctx: DriverContext,
  worldGuid: string,
  file: string,
  running: boolean,
): void {
  requireNative(rec);
  if (running) throw fail("請先停止伺服器再刪除玩家存檔", 409);
  if (!/^[A-Fa-f0-9]+\.sav$/.test(file)) throw fail("玩家存檔檔名不合法");

  const target = path.join(saveGamesDir(serverRoot(rec, ctx)), worldGuid, "Players", file);
  if (!fs.existsSync(target)) throw fail("找不到該玩家存檔", 404);
  fs.rmSync(target);
}
