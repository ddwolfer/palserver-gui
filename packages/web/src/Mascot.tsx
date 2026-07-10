import { useState } from "react";
import { FiX, FiExternalLink, FiHeart, FiInstagram, FiMessageCircle } from "react-icons/fi";
import { usePromoConfig } from "./promoConfig";
import { card, btn as btnPrimary, btnGhost } from "./ui";

/**
 * A big belly-up orange cat tucked into the dashboard's bottom corner. It
 * blends into the background (low opacity, warm orange that works in both
 * themes) but gently breathes/wiggles to invite a click — until it's been
 * clicked once, after which the attention state is retired (localStorage).
 * Clicking opens a light-hearted sponsor/company promo.
 */
const SEEN_KEY = "palserver.mascotSeen";

export function Mascot() {
  const [seen, setSeen] = useState(() => localStorage.getItem(SEEN_KEY) === "1");
  const [open, setOpen] = useState(false);

  const onClick = () => {
    if (!seen) {
      setSeen(true);
      localStorage.setItem(SEEN_KEY, "1");
    }
    setOpen(true);
  };

  return (
    <>
      <button
        onClick={onClick}
        aria-label="io software"
        className={`fixed right-2 bottom-0 z-0 origin-bottom transition-opacity ${
          seen ? "opacity-15 hover:opacity-40" : "animate-[breathe_3s_ease-in-out_infinite] opacity-45 hover:opacity-70"
        }`}
        style={{ width: "min(300px, 34vw)" }}
      >
        <CatBellyUp />
        {!seen && (
          <span className="absolute -top-2 left-1/2 -translate-x-1/2 animate-bounce rounded-full bg-pal px-3 py-1 text-xs font-extrabold whitespace-nowrap text-white shadow">
            摸摸我~
          </span>
        )}
      </button>

      {/* keyframes for the idle breathing (component-scoped) */}
      <style>{`@keyframes breathe{0%,100%{transform:scale(1) rotate(-1deg)}50%{transform:scale(1.03) rotate(1deg)}}`}</style>

      {open && <SponsorModal onClose={() => setOpen(false)} />}
    </>
  );
}

/** Inline SVG belly-up orange tabby — self-contained, theme-neutral. */
function CatBellyUp() {
  return (
    <svg viewBox="0 0 300 220" className="h-auto w-full" aria-hidden>
      {/* tail */}
      <path
        d="M40 150 Q0 140 10 105 Q18 80 45 92 Q30 110 48 128 Z"
        fill="#E8913A"
      />
      {/* belly/body — lying on its back */}
      <ellipse cx="160" cy="150" rx="105" ry="60" fill="#F2A550" />
      <ellipse cx="165" cy="158" rx="78" ry="42" fill="#FBE0C0" />
      {/* tabby stripes on the side */}
      <path d="M70 130 q10 12 4 30" stroke="#D9822B" strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M92 122 q10 14 5 34" stroke="#D9822B" strokeWidth="6" fill="none" strokeLinecap="round" />
      {/* four paws up */}
      {[110, 150, 190, 226].map((x, i) => (
        <g key={x}>
          <rect x={x - 12} y={i % 2 ? 78 : 84} width="24" height="34" rx="12" fill="#F2A550" />
          <ellipse cx={x} cy={i % 2 ? 80 : 86} rx="12" ry="9" fill="#FBE0C0" />
        </g>
      ))}
      {/* head (tilted back) */}
      <g>
        <ellipse cx="248" cy="150" rx="42" ry="40" fill="#F2A550" />
        {/* ears */}
        <path d="M222 122 l-6 -26 l24 12 Z" fill="#F2A550" />
        <path d="M274 122 l10 -24 l-22 16 Z" fill="#F2A550" />
        <path d="M224 118 l-2 -13 l12 7 Z" fill="#FBE0C0" />
        <path d="M272 118 l6 -12 l-12 9 Z" fill="#FBE0C0" />
        {/* happy closed eyes */}
        <path d="M232 150 q6 6 12 0" stroke="#5A3B1E" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        <path d="M256 150 q6 6 12 0" stroke="#5A3B1E" strokeWidth="3.5" fill="none" strokeLinecap="round" />
        {/* nose + mouth */}
        <path d="M248 158 l-4 5 h8 Z" fill="#C96A4A" />
        <path d="M248 163 q-5 6 -11 3 M248 163 q5 6 11 3" stroke="#5A3B1E" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        {/* whiskers */}
        <path d="M228 156 h-20 M230 162 h-20 M268 156 h20 M266 162 h20" stroke="#D9822B" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

function SponsorModal({ onClose }: { onClose: () => void }) {
  const { company } = usePromoConfig();
  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center bg-[rgb(35_32_48/0.55)] p-6 backdrop-blur-[3px]"
      onClick={onClose}
    >
      <div className={`${card} w-[420px] max-w-full`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between">
          <h2 className="inline-flex items-center gap-2 text-lg font-extrabold">
            <FiHeart className="size-5 text-pal" /> 喜歡這隻貓貓嗎?
          </h2>
          <button className="text-ink-muted transition hover:text-ink" onClick={onClose} aria-label="關閉">
            <FiX className="size-5" />
          </button>
        </div>
        <p className="mt-2 text-[13px] text-ink-muted">
          嗨~我們是 <b>io software</b>,palserver GUI 就是我們做的!
          這隻工具是免費的,如果它幫上你的忙,翻肚貓貓想討一點罐罐 🐟 ——
          追蹤我們、或小額贊助都是超大的鼓勵,讓我們能繼續把它做得更好。
        </p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <a className={`${btnPrimary} inline-flex items-center justify-center gap-1.5`} href={company.sponsor} target="_blank" rel="noreferrer">
            <FiHeart className="size-4" /> 贊助我們
          </a>
          <a className={`${btnGhost} inline-flex items-center justify-center gap-1.5`} href={company.instagram} target="_blank" rel="noreferrer">
            <FiInstagram className="size-4" /> Instagram
          </a>
          <a className={`${btnGhost} inline-flex items-center justify-center gap-1.5`} href={company.website} target="_blank" rel="noreferrer">
            <FiExternalLink className="size-4" /> 官方網站
          </a>
          <a className={`${btnGhost} inline-flex items-center justify-center gap-1.5`} href={company.discord} target="_blank" rel="noreferrer">
            <FiMessageCircle className="size-4" /> Discord
          </a>
        </div>
        <p className="mt-3 text-center text-xs text-ink-muted">感謝你讓帕魯世界更好玩 🐾</p>
      </div>
    </div>
  );
}
