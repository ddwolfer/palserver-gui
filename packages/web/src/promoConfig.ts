import { useEffect, useState } from "react";

/**
 * Promo/config data (company links, the IP-direct-connect service, VPN
 * tutorials) lives in promo-config.json in the GitHub repo, so it can be
 * updated without shipping a new build.
 *
 * Load order (per requirement):
 *  1. use the localStorage cache immediately, if any (last successful fetch) —
 *     so offline shows the most recent known values, not blanks;
 *  2. fetch the raw file from GitHub; on success, refresh the cache + UI;
 *  3. if there's no cache and GitHub is unreachable, fall back to the copy
 *     bundled at /promo-config.json (same origin, always available offline);
 *  4. the hardcoded DEFAULT below is the last resort.
 */

export interface PromoConfig {
  company: { name: string; website: string; instagram: string; discord: string; sponsor: string };
  ipService: { name: string; website: string; discord: string };
  vpn: {
    radmin: { site: string; tutorial: string };
    tailscale: { site: string; tutorial: string };
  };
}

const REMOTE_URL =
  "https://raw.githubusercontent.com/Wadoekeani/palserver-gui/main/promo-config.json";
const LOCAL_URL = "/promo-config.json";
const CACHE_KEY = "palserver.promoConfig";

/** Baked-in last resort, mirrors the committed promo-config.json. */
const DEFAULT: PromoConfig = {
  company: {
    name: "io software",
    website: "https://iosoftware.ai/",
    instagram: "https://www.instagram.com/iosoftware.ai/",
    discord: "https://discord.gg/sgMMdUZd3V",
    sponsor: "https://buymeacoffee.com/dalufish",
  },
  ipService: {
    name: "IP 直連設定服務",
    website: "https://iosoftware.ai/ip-connect-service",
    discord: "https://discord.gg/sgMMdUZd3V",
  },
  vpn: {
    radmin: {
      site: "https://www.radmin-vpn.com/",
      tutorial:
        "https://www.youtube.com/results?search_query=Radmin+VPN+Palworld+%E8%81%AF%E6%A9%9F+%E6%95%99%E5%AD%B8",
    },
    tailscale: {
      site: "https://tailscale.com/",
      tutorial:
        "https://www.youtube.com/results?search_query=Tailscale+Palworld+%E5%B0%88%E7%94%A8%E4%BC%BA%E6%9C%8D%E5%99%A8+%E6%95%99%E5%AD%B8",
    },
  },
};

function readCache(): PromoConfig | null {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) ?? "null");
  } catch {
    return null;
  }
}

function looksValid(v: unknown): v is PromoConfig {
  const c = v as PromoConfig | null;
  return !!c?.company?.website && !!c?.ipService?.website && !!c?.vpn?.radmin?.site;
}

/**
 * Reactive config: starts from cache-or-default, then refreshes from GitHub.
 * Shared module state means it's fetched at most once per session.
 */
let shared: PromoConfig = readCache() ?? DEFAULT;
let fetched = false;
const listeners = new Set<(c: PromoConfig) => void>();

async function refresh(): Promise<void> {
  if (fetched) return;
  fetched = true;
  // 1) remote (GitHub) — the source of truth.
  try {
    const res = await fetch(REMOTE_URL, { cache: "no-cache", signal: AbortSignal.timeout(6000) });
    if (res.ok) {
      const data = await res.json();
      if (looksValid(data)) {
        shared = data;
        localStorage.setItem(CACHE_KEY, JSON.stringify(data));
        listeners.forEach((l) => l(shared));
        return;
      }
    }
  } catch {
    /* offline or blocked — fall through */
  }
  // 2) if we had no cache to begin with, try the bundled local copy.
  if (!readCache()) {
    try {
      const res = await fetch(LOCAL_URL, { signal: AbortSignal.timeout(4000) });
      if (res.ok) {
        const data = await res.json();
        if (looksValid(data)) {
          shared = data;
          listeners.forEach((l) => l(shared));
        }
      }
    } catch {
      /* keep DEFAULT */
    }
  }
}

export function usePromoConfig(): PromoConfig {
  const [config, setConfig] = useState(shared);
  useEffect(() => {
    listeners.add(setConfig);
    void refresh();
    setConfig(shared);
    return () => {
      listeners.delete(setConfig);
    };
  }, []);
  return config;
}
