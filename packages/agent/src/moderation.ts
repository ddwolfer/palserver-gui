import fs from "node:fs";
import path from "node:path";
import type { BanEntry, ModerationLists, WhitelistEntry } from "@palserver/shared";
import type { DriverContext } from "./driver.js";
import type { InstanceRecord } from "./store.js";
import { serverRoot } from "./native.js";
import { rconExec } from "./rcon.js";

/**
 * PalDefender whitelist & banlist.
 *
 * Reads are file-based (WhiteList.json / Banlist.json / Config.json) so the
 * lists show even when the server is offline. Mutations go through RCON —
 * PalDefender's docs say not to hand-edit Banlist.json, and RCON keeps the
 * plugin's in-memory state in sync. So this module reads; the routes issue
 * the whitelist_add / ban / banip / unban commands.
 */

const looksLikeIp = (s: string) => /^\d{1,3}(\.\d{1,3}){3}(\/\d+)?$/.test(s.trim());

function palDefenderDir(rec: InstanceRecord, ctx: DriverContext): string | null {
  const win64 = path.join(serverRoot(rec, ctx), "Pal", "Binaries", "Win64");
  for (const name of ["PalDefender", "palguard"]) {
    const dir = path.join(win64, name);
    if (fs.existsSync(dir)) return dir;
  }
  return null;
}

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

/** WhiteList.json is an array of strings (UserIds and/or IPs). */
function parseWhitelist(dir: string): WhitelistEntry[] {
  const raw = readJson<unknown>(path.join(dir, "WhiteList.json"));
  const values: string[] = Array.isArray(raw)
    ? raw.filter((v): v is string => typeof v === "string")
    : Array.isArray((raw as { whitelist?: string[] })?.whitelist)
      ? (raw as { whitelist: string[] }).whitelist
      : [];
  return values.map((value) => ({ value, isIp: looksLikeIp(value) }));
}

/** Banlist.json shape varies by version; accept the common forms. */
function parseBanlist(dir: string): BanEntry[] {
  const raw = readJson<unknown>(path.join(dir, "Banlist.json"));
  const list: unknown[] = Array.isArray(raw)
    ? raw
    : Array.isArray((raw as { bans?: unknown[] })?.bans)
      ? (raw as { bans: unknown[] }).bans
      : raw && typeof raw === "object"
        ? Object.entries(raw as Record<string, unknown>).map(([k, v]) => ({ userId: k, ...(v as object) }))
        : [];
  return list.map((item): BanEntry => {
    if (typeof item === "string") {
      return looksLikeIp(item) ? { userId: null, ip: item } : { userId: item, ip: null };
    }
    const o = (item ?? {}) as Record<string, unknown>;
    const userId = (o.userId ?? o.UserId ?? o.userid ?? o.steamId ?? null) as string | null;
    const ip = (o.ip ?? o.IP ?? o.Ip ?? null) as string | null;
    const reason = (o.reason ?? o.Reason ?? undefined) as string | undefined;
    return { userId: userId || null, ip: ip || null, reason };
  });
}

function whitelistEnabled(dir: string): boolean {
  const config = readJson<{ useWhitelist?: boolean }>(path.join(dir, "Config.json"));
  return config?.useWhitelist === true;
}

export function getModerationLists(rec: InstanceRecord, ctx: DriverContext): ModerationLists {
  if (rec.backend !== "native") {
    return { supported: false, reason: "名單管理僅支援原生模式的實例", whitelistEnabled: false, whitelist: [], bans: [] };
  }
  const dir = palDefenderDir(rec, ctx);
  if (!dir) {
    return {
      supported: false,
      reason: "尚未安裝 PalDefender,或伺服器尚未啟動過以生成設定檔",
      whitelistEnabled: false,
      whitelist: [],
      bans: [],
    };
  }
  return {
    supported: true,
    whitelistEnabled: whitelistEnabled(dir),
    whitelist: parseWhitelist(dir),
    bans: parseBanlist(dir),
  };
}

/** RCON-backed mutations. PalDefender reloads its lists as it runs these. */
export const moderation = {
  whitelistAdd: (rec: InstanceRecord, userId: string) => rconExec(rec, `whitelist_add ${userId}`),
  whitelistRemove: (rec: InstanceRecord, userId: string) => rconExec(rec, `whitelist_remove ${userId}`),
  ban: (rec: InstanceRecord, userId: string, reason?: string) =>
    rconExec(rec, `ban ${userId}${reason ? ` ${reason}` : ""}`),
  unban: (rec: InstanceRecord, userId: string) => rconExec(rec, `unban ${userId}`),
  banIp: (rec: InstanceRecord, ip: string) => rconExec(rec, `banip ${ip}`),
  unbanIp: (rec: InstanceRecord, ip: string) => rconExec(rec, `unbanip ${ip}`),
};
