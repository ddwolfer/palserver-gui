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

/**
 * 內嵌 SVG:圓滾滾、四腳朝天的翻肚橘貓 —— 自給自足、深淺色主題都適用。
 * 走 chibi 可愛路線(大頭、粉嫩肚肚、肉球、腮紅、瞇眼笑)。
 */
function CatBellyUp() {
  const ORANGE = "#F4A64D";
  const ORANGE_D = "#E08C30"; // 陰影/條紋
  const CREAM = "#FBE3C6"; // 肚子/內耳/肉球
  const INK = "#6B4423"; // 五官線條
  const BLUSH = "#F6A7A0"; // 腮紅
  return (
    <svg viewBox="0 0 320 240" className="h-auto w-full" aria-hidden>
      {/* 尾巴 —— 從左側翹起、尾端上勾 */}
      <path
        d="M46 168 Q6 172 8 138 Q10 108 40 116 Q22 132 40 150 Q30 160 52 158 Z"
        fill={ORANGE}
      />
      <path d="M16 132 Q12 120 30 118" stroke={ORANGE_D} strokeWidth="5" fill="none" strokeLinecap="round" />

      {/* 身體 —— 仰躺的大橢圓 */}
      <ellipse cx="168" cy="166" rx="112" ry="60" fill={ORANGE} />
      {/* 粉嫩肚肚 */}
      <ellipse cx="176" cy="176" rx="82" ry="42" fill={CREAM} />
      {/* 側身虎斑條紋 */}
      <path d="M84 150 q8 16 2 34" stroke={ORANGE_D} strokeWidth="6" fill="none" strokeLinecap="round" />
      <path d="M104 142 q9 18 3 38" stroke={ORANGE_D} strokeWidth="6" fill="none" strokeLinecap="round" />

      {/* 四隻短腳朝天,附粉嫩肉球 */}
      {[118, 158, 198, 236].map((x, i) => {
        const top = i % 2 ? 96 : 104;
        return (
          <g key={x}>
            <rect x={x - 13} y={top} width="26" height="40" rx="13" fill={ORANGE} />
            <ellipse cx={x} cy={top + 6} rx="11" ry="8.5" fill={CREAM} />
            {/* 肉球:一大三小 */}
            <ellipse cx={x} cy={top + 8} rx="4.5" ry="3.6" fill={BLUSH} />
            <circle cx={x - 6} cy={top + 1} r="2" fill={BLUSH} />
            <circle cx={x} cy={top - 1} r="2" fill={BLUSH} />
            <circle cx={x + 6} cy={top + 1} r="2" fill={BLUSH} />
          </g>
        );
      })}

      {/* 頭 —— 往後仰在右側 */}
      <g>
        {/* 耳朵 */}
        <path d="M236 138 l-8 -30 l30 16 Z" fill={ORANGE} />
        <path d="M292 138 l14 -28 l-28 20 Z" fill={ORANGE} />
        <path d="M240 132 l-3 -15 l15 9 Z" fill={CREAM} />
        <path d="M290 132 l8 -14 l-15 11 Z" fill={CREAM} />
        {/* 圓臉 */}
        <ellipse cx="268" cy="164" rx="46" ry="43" fill={ORANGE} />
        {/* 頭頂虎斑 */}
        <path d="M262 128 v10 M272 128 v10" stroke={ORANGE_D} strokeWidth="4" strokeLinecap="round" />
        {/* 腮紅 */}
        <ellipse cx="240" cy="172" rx="9" ry="6" fill={BLUSH} opacity="0.75" />
        <ellipse cx="296" cy="172" rx="9" ry="6" fill={BLUSH} opacity="0.75" />
        {/* 瞇眼笑 */}
        <path d="M248 162 q7 7 14 0" stroke={INK} strokeWidth="3.6" fill="none" strokeLinecap="round" />
        <path d="M274 162 q7 7 14 0" stroke={INK} strokeWidth="3.6" fill="none" strokeLinecap="round" />
        {/* 鼻子 + 嘴 */}
        <path d="M268 172 l-5 5.5 h10 Z" fill="#D08A6A" />
        <path d="M268 177.5 q-6 7 -13 3 M268 177.5 q6 7 13 3" stroke={INK} strokeWidth="2.6" fill="none" strokeLinecap="round" />
        {/* 鬍鬚 */}
        <path d="M244 168 h-22 M246 175 h-22 M292 168 h22 M290 175 h22" stroke={ORANGE_D} strokeWidth="2" strokeLinecap="round" opacity="0.8" />
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
          嗨嗨~ 我是 <b>Dalufish</b>, palserver GUI 就是我做的!
          這隻工具是免費的, 如果它幫上你的忙, 翻肚貓貓想討一點罐罐 ——
          追蹤我們、或小額贊助都是超大的鼓勵, 讓我們能繼續把它做得更好。
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
