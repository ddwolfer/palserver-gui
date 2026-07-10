import { FiCoffee, FiExternalLink, FiHeart, FiX } from "react-icons/fi";
import { usePromoConfig } from "./promoConfig";
import { Overlay, btn, card } from "./ui";

/**
 * 感謝名單彈窗:開發人員/核心團隊 + 捐贈名單。名單內容走 promo-config.json
 * (遠端可改,見 promoConfig.ts),不用改版就能增減人員或換連結。
 */
export function CreditsModal({ onClose }: { onClose: () => void }) {
  const promo = usePromoConfig();
  return (
    <Overlay onClose={onClose}>
      <div className={`${card} flex w-[430px] max-w-full flex-col gap-4`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="inline-flex items-center gap-2 text-lg font-extrabold">
            <FiHeart className="size-5 text-pal" /> 感謝名單
          </h2>
          <button className="text-ink-muted transition hover:text-ink" onClick={onClose} aria-label="關閉">
            <FiX className="size-5" />
          </button>
        </div>

        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-extrabold">開發人員</h3>
          {promo.credits.developers.map((d) =>
            d.url ? (
              <a
                key={d.name}
                href={d.url}
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between gap-2 rounded-xl border-2 border-line bg-card-soft px-3 py-2 transition hover:-translate-y-px hover:border-pal"
              >
                <span>
                  <span className="block text-sm font-extrabold">{d.name}</span>
                  <span className="block text-xs text-ink-muted">{d.role}</span>
                </span>
                <FiExternalLink className="size-4 shrink-0 text-ink-muted" />
              </a>
            ) : (
              <div key={d.name} className="rounded-xl border-2 border-line bg-card-soft px-3 py-2">
                <span className="block text-sm font-extrabold">{d.name}</span>
                <span className="block text-xs text-ink-muted">{d.role}</span>
              </div>
            ),
          )}
        </div>

        <div className="border-t border-line pt-3">
          <h3 className="mb-2 text-sm font-extrabold">捐贈名單</h3>
          <p className="mb-2 text-[13px] text-ink-muted">
            感謝每一位支持 palserver GUI 的贊助者,完整名單與贊助方式請見:
          </p>
          <a
            className={`${btn} inline-flex items-center gap-1.5`}
            href={promo.credits.donate}
            target="_blank"
            rel="noreferrer"
          >
            <FiCoffee className="size-4" /> Buy Me a Coffee
          </a>
        </div>
      </div>
    </Overlay>
  );
}
