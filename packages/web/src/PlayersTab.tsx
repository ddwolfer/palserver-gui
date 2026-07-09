import { useCallback, useEffect, useState } from "react";
import {
  FiUsers,
  FiSend,
  FiSave,
  FiSlash,
  FiLogOut,
  FiLogIn,
  FiRefreshCw,
  FiEye,
  FiEyeOff,
  FiCopy,
  FiCheck,
  FiUserCheck,
  FiUserX,
} from "react-icons/fi";
import {
  savToMap,
  type KnownPlayer,
  type LiveStatus,
  type ModerationLists,
  type PresenceEvent,
  type RestPlayer,
} from "@palserver/shared";
import type { AgentClient } from "./api";
import { btn, btnGhost, card, errorCls, inputCls } from "./ui";

const fmtUptime = (seconds: number) => {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} 小時 ${m} 分` : `${m} 分`;
};

/** Steam IDs identify a real person, so show them masked by default —
 * enough to tell players apart, not enough to paste into a lookup site. */
function maskSteamId(userId: string): string {
  const digits = userId.replace(/^steam_/, "");
  if (digits.length <= 8) return digits;
  return `${digits.slice(0, 4)}${"•".repeat(6)}${digits.slice(-4)}`;
}

function SteamId({ userId }: { userId: string }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);
  const raw = userId.replace(/^steam_/, "");

  const copy = async () => {
    await navigator.clipboard.writeText(raw).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-ink-muted">
      {revealed ? raw : maskSteamId(userId)}
      <button
        onClick={() => setRevealed((v) => !v)}
        className="text-ink-muted transition hover:text-pal"
        aria-label={revealed ? "隱藏 Steam ID" : "顯示 Steam ID"}
        title={revealed ? "隱藏" : "顯示完整 Steam ID"}
      >
        {revealed ? <FiEyeOff className="size-3.5" /> : <FiEye className="size-3.5" />}
      </button>
      <button
        onClick={copy}
        className="text-ink-muted transition hover:text-pal"
        aria-label="複製 Steam ID"
        title="複製"
      >
        {copied ? <FiCheck className="size-3.5 text-grass" /> : <FiCopy className="size-3.5" />}
      </button>
    </span>
  );
}

const EMPTY_MODERATION: ModerationLists = {
  supported: false,
  whitelistEnabled: false,
  whitelist: [],
  bans: [],
};

export function PlayersTab({ client, instanceId }: { client: AgentClient; instanceId: string }) {
  const [live, setLive] = useState<LiveStatus | null>(null);
  const [known, setKnown] = useState<KnownPlayer[]>([]);
  const [events, setEvents] = useState<PresenceEvent[]>([]);
  const [moderation, setModeration] = useState<ModerationLists>(EMPTY_MODERATION);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [liveStatus, knownPlayers, presenceEvents, mod] = await Promise.all([
        client.live(instanceId),
        client.knownPlayers(instanceId).catch(() => []),
        client.presenceEvents(instanceId, 50).catch(() => []),
        client.moderation(instanceId).catch(() => EMPTY_MODERATION),
      ]);
      setLive(liveStatus);
      setKnown(knownPlayers);
      setEvents(presenceEvents);
      setModeration(mod);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, [client, instanceId]);

  const bannedIds = new Set(moderation.bans.map((b) => b.userId).filter(Boolean));
  const whitelistedIds = new Set(moderation.whitelist.filter((w) => !w.isIp).map((w) => w.value));

  useEffect(() => {
    void refresh();
    const timer = setInterval(refresh, 5000);
    return () => clearInterval(timer);
  }, [refresh]);

  const flash = (text: string) => {
    setNotice(text);
    setTimeout(() => setNotice(null), 3000);
  };

  const act = async (fn: () => Promise<unknown>, success: string) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      flash(success);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const announce = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    await act(() => client.announce(instanceId, message.trim()), "已廣播訊息");
    setMessage("");
  };

  const playerAction = async (player: RestPlayer, action: "kick" | "ban") => {
    const verb = action === "kick" ? "踢出" : "封鎖";
    if (!confirm(`確定要${verb}「${player.name}」嗎?此舉動會將他從伺服器移除。`)) return;
    await act(
      () => client.playerAction(instanceId, player.userId, action, `你已被${verb}`),
      `已${verb} ${player.name}`,
    );
  };

  const moderate = (
    action: "whitelist_add" | "whitelist_remove" | "ban" | "unban",
    value: string,
    name: string,
    verb: string,
  ) => {
    if (action === "ban" && !confirm(`確定要封鎖「${name}」嗎?`)) return;
    void act(() => client.moderate(instanceId, action, value), `已${verb} ${name}`);
  };

  if (!live) return <p className="text-ink-muted">{error ?? "載入中…"}</p>;

  // The server may be down, but the roster and history are recorded by the
  // agent and stay useful — that's when you look someone up to unban them.
  if (!live.available) {
    return (
      <div className="flex flex-col gap-4">
        <div className="rounded-(--radius-cute) border-2 border-dashed border-line px-6 py-10 text-center text-ink-muted">
          <FiUsers className="mx-auto mb-2 size-11" />
          <p className="font-bold">目前無法連線到伺服器的 REST API</p>
          <p className="mt-1 text-[13px]">{live.reason}</p>
        </div>
        <KnownPlayersCard known={known} />
        <PresenceTimeline events={events} />
      </div>
    );
  }

  const { info, metrics, players } = live;

  return (
    <div className="flex flex-col gap-4">
      {error && <p className={errorCls}>{error}</p>}
      {notice && (
        <p className="rounded-xl bg-grass/10 px-3 py-2 text-[13px] font-bold text-grass">{notice}</p>
      )}

      {metrics && (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="在線玩家" value={`${metrics.currentplayernum} / ${metrics.maxplayernum}`} />
          <Stat label="伺服器 FPS" value={String(metrics.serverfps)} />
          <Stat label="運行時間" value={fmtUptime(metrics.uptime)} />
          <Stat label="遊戲天數" value={`第 ${metrics.days} 天`} />
        </div>
      )}

      <div className={card}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-extrabold">{info?.servername ?? "伺服器"}</h3>
            <p className="text-[13px] text-ink-muted">
              版本 {info?.version ?? "—"} · 據點 {metrics?.basecampnum ?? 0} 個 · 幀時間{" "}
              {metrics ? `${metrics.serverframetime.toFixed(1)} ms` : "—"}
            </p>
          </div>
          <div className="flex gap-2">
            <button className={btnGhost} onClick={refresh} disabled={busy} aria-label="重新整理">
              <FiRefreshCw className="size-4" />
            </button>
            <button
              className={`${btnGhost} inline-flex items-center gap-1.5`}
              onClick={() => act(() => client.saveWorld(instanceId), "世界已存檔")}
              disabled={busy}
            >
              <FiSave className="size-4" /> 立即存檔
            </button>
          </div>
        </div>
      </div>

      <form className={`${card} flex flex-wrap items-center gap-2`} onSubmit={announce}>
        <input
          className={`${inputCls} min-w-52 flex-1`}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="輸入要廣播給所有玩家的訊息…"
          maxLength={500}
        />
        <button className={`${btn} inline-flex items-center gap-1.5`} disabled={busy || !message.trim()}>
          <FiSend className="size-4" /> 廣播
        </button>
      </form>

      <div className={`${card} p-0`}>
        <h3 className="border-b-2 border-line px-5 py-3 text-sm font-extrabold text-ink-muted">
          在線玩家({players.length})
        </h3>
        {players.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13px] text-ink-muted">目前沒有玩家在線上。</p>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {players.map((p) => {
              const loc = savToMap(p.location_x, p.location_y);
              return (
              <div key={p.userId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <div className="min-w-40 flex-1">
                  <p className="text-sm font-extrabold">{p.name}</p>
                  <p className="text-xs text-ink-muted">
                    Lv.{p.level} · Ping {Math.round(p.ping)} ms · 建築 {p.building_count} · 座標{" "}
                    {Math.round(loc.x)}, {Math.round(loc.y)}
                  </p>
                  <p className="mt-0.5">
                    <SteamId userId={p.userId} />
                  </p>
                </div>
                <p className="hidden text-xs text-ink-muted sm:block">{p.ip}</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    className={`${btnGhost} inline-flex items-center gap-1.5`}
                    onClick={() => playerAction(p, "kick")}
                    disabled={busy}
                  >
                    <FiLogOut className="size-3.5" /> 踢出
                  </button>
                  <button
                    className={`${btnGhost} inline-flex items-center gap-1.5 text-berry hover:border-berry`}
                    onClick={() => playerAction(p, "ban")}
                    disabled={busy}
                  >
                    <FiSlash className="size-3.5" /> 封鎖
                  </button>
                  {moderation.supported &&
                    (whitelistedIds.has(p.userId) ? (
                      <button
                        className={`${btnGhost} inline-flex items-center gap-1.5`}
                        onClick={() => moderate("whitelist_remove", p.userId, p.name, "移出白名單")}
                        disabled={busy}
                      >
                        <FiUserX className="size-3.5" /> 移出白名單
                      </button>
                    ) : (
                      <button
                        className={`${btnGhost} inline-flex items-center gap-1.5 text-grass hover:border-grass`}
                        onClick={() => moderate("whitelist_add", p.userId, p.name, "加入白名單")}
                        disabled={busy}
                      >
                        <FiUserCheck className="size-3.5" /> 白名單
                      </button>
                    ))}
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      <KnownPlayersCard known={known} />
      <ModerationCard
        moderation={moderation}
        busy={busy}
        onUnban={(userId) => moderate("unban", userId, userId, "解除封鎖")}
        onWhitelistRemove={(value) => moderate("whitelist_remove", value, value, "移出白名單")}
      />
      <PresenceTimeline events={events} />
    </div>
  );
}

const fmtPlaytime = (seconds: number) => {
  if (seconds < 60) return "不到 1 分";
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h > 0 ? `${h} 小時 ${m} 分` : `${m} 分`;
};

const fmtWhen = (iso: string) => new Date(iso).toLocaleString();

/** Everyone the agent has ever seen here — the roster that outlives logouts. */
function KnownPlayersCard({ known }: { known: KnownPlayer[] }) {
  const offline = known.filter((p) => !p.online);
  return (
    <div className={`${card} p-0`}>
      <h3 className="border-b-2 border-line px-5 py-3 text-sm font-extrabold text-ink-muted">
        歷史玩家({known.length})
      </h3>
      {known.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-ink-muted">
          尚未記錄到任何玩家。agent 每 15 秒會記錄一次在線狀態。
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-line">
          {known.map((p) => (
            <div key={p.userId} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3">
              <div className="min-w-40 flex-1">
                <p className="flex items-center gap-2 text-sm font-extrabold">
                  {p.name}
                  {p.online ? (
                    <span className="inline-flex items-center gap-1 rounded-full border-[1.5px] border-grass/40 bg-grass/15 px-2 py-0.5 text-xs font-bold text-grass">
                      <span className="size-1.5 rounded-full bg-current" /> 在線
                    </span>
                  ) : (
                    <span className="text-xs font-bold text-ink-muted">離線</span>
                  )}
                </p>
                <p className="text-xs text-ink-muted">
                  Lv.{p.lastLevel} · 遊玩 {fmtPlaytime(p.playtimeSeconds)} · {p.sessions} 次連線
                </p>
                <p className="mt-0.5">
                  <SteamId userId={p.userId} />
                </p>
              </div>
              <div className="text-right text-xs text-ink-muted">
                <p>最後上線 {fmtWhen(p.lastSeen)}</p>
                <p>首次出現 {fmtWhen(p.firstSeen)}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {offline.length > 0 && (
        <p className="border-t-2 border-line px-5 py-2.5 text-xs text-ink-muted">
          離線玩家仍可在「指令」分頁被選為目標(例如 unban)。
        </p>
      )}
    </div>
  );
}

/** PalDefender whitelist and banlist, when the plugin is installed. */
function ModerationCard({
  moderation,
  busy,
  onUnban,
  onWhitelistRemove,
}: {
  moderation: ModerationLists;
  busy: boolean;
  onUnban: (userId: string) => void;
  onWhitelistRemove: (value: string) => void;
}) {
  if (!moderation.supported) return null;
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className={`${card} p-0`}>
        <h3 className="flex items-center justify-between border-b-2 border-line px-5 py-3 text-sm font-extrabold text-ink-muted">
          <span>白名單({moderation.whitelist.length})</span>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${moderation.whitelistEnabled ? "bg-grass/15 text-grass" : "bg-card-soft text-ink-muted"}`}
          >
            {moderation.whitelistEnabled ? "已啟用" : "未啟用"}
          </span>
        </h3>
        {moderation.whitelist.length === 0 ? (
          <p className="px-5 py-6 text-center text-[13px] text-ink-muted">白名單是空的。</p>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {moderation.whitelist.map((w) => (
              <div key={w.value} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <span className="font-mono text-xs break-all">
                  {w.isIp ? "IP " : ""}
                  {w.value}
                </span>
                {!w.isIp && (
                  <button
                    className="shrink-0 rounded-full border-[1.5px] border-line px-3 py-1 text-xs font-bold text-berry transition hover:border-berry"
                    onClick={() => onWhitelistRemove(w.value)}
                    disabled={busy}
                  >
                    移除
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={`${card} p-0`}>
        <h3 className="border-b-2 border-line px-5 py-3 text-sm font-extrabold text-ink-muted">
          封鎖名單({moderation.bans.length})
        </h3>
        {moderation.bans.length === 0 ? (
          <p className="px-5 py-6 text-center text-[13px] text-ink-muted">沒有被封鎖的玩家。</p>
        ) : (
          <div className="flex flex-col divide-y divide-line">
            {moderation.bans.map((b, i) => (
              <div key={`${b.userId ?? b.ip}-${i}`} className="flex items-center justify-between gap-3 px-5 py-2.5">
                <div className="min-w-0">
                  <p className="font-mono text-xs break-all">{b.userId ?? `IP ${b.ip}`}</p>
                  {b.reason && <p className="text-xs text-ink-muted">原因:{b.reason}</p>}
                </div>
                {b.userId && (
                  <button
                    className="shrink-0 rounded-full border-[1.5px] border-line px-3 py-1 text-xs font-bold text-grass transition hover:border-grass"
                    onClick={() => onUnban(b.userId!)}
                    disabled={busy}
                  >
                    解除
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PresenceTimeline({ events }: { events: PresenceEvent[] }) {
  return (
    <div className={`${card} p-0`}>
      <h3 className="border-b-2 border-line px-5 py-3 text-sm font-extrabold text-ink-muted">
        上下線紀錄
      </h3>
      {events.length === 0 ? (
        <p className="px-5 py-8 text-center text-[13px] text-ink-muted">尚無紀錄。</p>
      ) : (
        <div className="max-h-72 overflow-y-auto">
          <div className="flex flex-col divide-y divide-line">
            {events.map((e, i) => (
              <div key={`${e.at}-${e.userId}-${i}`} className="flex items-center gap-3 px-5 py-2">
                {e.type === "join" ? (
                  <FiLogIn className="size-4 shrink-0 text-grass" />
                ) : (
                  <FiLogOut className="size-4 shrink-0 text-ink-muted" />
                )}
                <span className="flex-1 text-sm font-bold">{e.name}</span>
                <span className="text-xs text-ink-muted">
                  {e.type === "join" ? "上線" : "離線"} · {fmtWhen(e.at)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className={card}>
      <p className="text-xs font-bold text-ink-muted">{label}</p>
      <p className="mt-1 text-lg font-extrabold">{value}</p>
    </div>
  );
}
