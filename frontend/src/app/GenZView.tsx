"use client";

import { useEffect, useMemo, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowRight, MessageCircle, Search, ShoppingBag, User } from "lucide-react";

import { Photo } from "@/components/Photo";
import { ProductCard, sizesLeft } from "@/components/ProductCard";
import { Stories } from "@/components/Stories";
import { WaysToWear } from "@/components/WaysToWear";
import { PieceWeave } from "@/components/PieceWeave";
import { Reveal } from "@/components/Reveal";
import { Wordmark } from "@/components/Wordmark";
import { LegalFooter } from "@/components/LegalFooter";
import { DealsRail } from "@/components/DealsRail";
import {
  formatPrice, productImageFocus, productImageUrl, useProducts,
  type Product, type ProductListResponse,
} from "@/lib/queries/catalog";
import { FOUNDER, HERO, MANIFESTO } from "@/lib/brand";
import { heroEyebrow, shortLine, type Truth } from "@/lib/truth";
import { POLICY_TERMS } from "@/lib/legal";
import { BROWSE_ONLY, whatsappContactUrl } from "@/lib/launchMode";
import { useCartStore } from "@/store/useCartStore";
import { useSectionView } from "@/lib/useSectionView";
import { trackEvent } from "@/lib/queries/analytics";
import { markOpenSource, recordEnquiry } from "@/lib/enquiry";
import { useAuthStore } from "@/store/useAuthStore";

/**
 * ZISUN for the women who will be most of its buyers from 2027 to 2035.
 *
 * What the research said, and what each section does about it (DESIGN.md §16):
 *
 *  - They trust their own research above any ad (27%, then friends 20%,
 *    reviews 15%) and 82% demand honesty. So the page shows its receipts:
 *    what the price includes, what shipping costs, what happens if the size
 *    is wrong - in plain words, before checkout, never in fine print.
 *  - Size and fit cause most fashion returns (53-70%). So fit is a section of
 *    its own, led by the one fact no competitor can copy: every photograph is
 *    of the founder, at 153 cm - the height of most Indian women.
 *  - Only 1% want "full sparkle" for a festival; 37.5% want "low-key chic".
 *    So the language is the label's own - ivory, burgundy, one serif - moving
 *    with confidence rather than shouting. Nothing loops, nothing counts
 *    down, nothing claims a scarcity that is not true.
 *  - They browse in full-screen stories, and they scroll DOWN. The drop was
 *    a sideways rail for three weeks: 2,029 visits in the week of 13 Oct 2026
 *    gave it 520 swipes and 284 opens, and the thumb's own motion - down -
 *    carried 64% past it. So the pieces now sit one below the other, full
 *    width, in the direction the thumb already moves; the Stories row stays.
 *  - They arrive in Instagram's in-app browser on mid-range Android. So
 *    nothing here needs WebGPU or a heavy library; motion is transform and
 *    opacity only, and reduced-motion gets the finished page.
 *
 * Every product number is live (seeded by the server, refetched on mount),
 * every photograph goes through Photo, and every claim about the cloth comes
 * from lib/truth.ts - the page states nothing the catalogue does not record.
 */

const sizesInStock = sizesLeft;

/** Shelf order, except that a piece left in one size goes last: a feed that
 *  opens on "only 2XL left" three times teaches a visitor the shop is empty. */
export function feedOrder(pieces: Product[]): Product[] {
  if (BROWSE_ONLY) return pieces;
  const full = pieces.filter((p) => sizesInStock(p).length > 1);
  const thin = pieces.filter((p) => sizesInStock(p).length <= 1);
  return [...full, ...thin];
}

function colours(p: Product): string[] {
  return Array.from(new Set(p.variants.filter((v) => v.is_active && v.color).map((v) => v.color as string)));
}

/** "Rich Wine Dabu Cotton Kurta Set" → "Rich Wine". */
function shortName(name: string): string {
  const head = name.split(/\s[—–-]\s/)[0];
  const words = head.split(/\s+/);
  return words.slice(0, 2).join(" ");
}

// ── Header ───────────────────────────────────────────────────────────────────

function Header() {
  const router = useRouter();
  const signedIn = useAuthStore((s) => s.user !== null);
  const count = useCartStore((s) => s.items.reduce((n, i) => n + i.quantity, 0));
  const toggleCart = useCartStore((s) => s.toggleCart);
  return (
    <header className="sticky top-0 z-40 flex items-center justify-between px-5 lg:px-10 h-14 bg-porcelain/85 backdrop-blur-md border-b border-line">
      <Link href="/" aria-label="ZISUN, home"><Wordmark size="sm" showTagline={false} /></Link>
      <nav className="flex items-center gap-1 sm:gap-3 text-sm text-ink">
        <Link href="/shop" data-track="nav_everything" className="hidden sm:inline-flex items-center min-h-[44px] px-2 hover:underline underline-offset-4">Everything</Link>
        <button type="button" data-track="nav_search" onClick={() => router.push("/search")} className="inline-flex h-10 w-10 items-center justify-center" aria-label="Search">
          <Search className="w-5 h-5" aria-hidden />
        </button>
        {/* Always present: without it the storefront has no way to sign in
            or reach an account (the old home page learned this). */}
        <button type="button" data-track="nav_account" onClick={() => router.push(signedIn ? "/profile" : "/login")} className="inline-flex h-10 w-10 items-center justify-center" aria-label={signedIn ? "Your account" : "Sign in"}>
          <User className="w-5 h-5" aria-hidden />
        </button>
        <button type="button" data-track="nav_bag" onClick={toggleCart} className="relative inline-flex h-10 w-10 items-center justify-center -mr-2" aria-label={`Bag, ${count} ${count === 1 ? "piece" : "pieces"}`}>
          <ShoppingBag className="w-5 h-5" aria-hidden />
          {count > 0 && (
            <span className="absolute top-1 right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-burgundy text-porcelain text-[10px] font-semibold leading-[18px] text-center">{count}</span>
          )}
        </button>
      </nav>
    </header>
  );
}

// ── Hero ─────────────────────────────────────────────────────────────────────

/**
 * The label's line, word by word.
 *
 * Animated in CSS (`.zs-word` in globals.css), not in JS. The first version
 * asked framer-motion whether motion was reduced and rendered different
 * markup when it was - but the server cannot know, so a phone set to reduce
 * motion hydrated against the wrong HTML (React #425). The markup is now the
 * same everywhere and the media query does the switching.
 */
function KineticLine({ text, italic, delay = 0 }: { text: string; italic?: boolean; delay?: number }) {
  const words = text.split(" ");
  return (
    <span className={italic ? "italic" : ""}>
      {words.map((w, i) => (
        <span key={i} className="inline-block overflow-hidden align-bottom pb-[0.08em]">
          <span className="zs-word inline-block" style={{ animationDelay: `${delay + i * 0.09}s` }}>{w}</span>
          {i < words.length - 1 ? " " : ""}
        </span>
      ))}
    </span>
  );
}

function Hero({ lead, truth }: { lead: Product | undefined; truth: Truth }) {
  const eyebrow = heroEyebrow(truth);
  const scrollToDrop = () => document.getElementById("drop")?.scrollIntoView({ behavior: "smooth", block: "start" });
  const sizes = lead ? sizesInStock(lead) : [];
  return (
    <section className="relative h-[80svh] min-h-[520px] max-h-[900px] overflow-hidden bg-ink" aria-label="ZISUN">
      {lead && (
        <Photo
          src={productImageUrl(lead)}
          alt={`${lead.name}, worn by ${FOUNDER.name}`}
          fill
          priority
          sizes="100vw"
          focus={productImageFocus(lead)}
          ground={false}
        />
      )}
      {/* A scrim from the photograph's own dark, so the words are readable on
          any picture without a box behind them. */}
      <div className="absolute inset-0 bg-gradient-to-t from-ink/85 via-ink/25 to-ink/10" aria-hidden />
      <div className="absolute inset-x-0 bottom-0 px-5 pb-8 lg:px-12 lg:pb-14 text-porcelain">
        {eyebrow && <p className="text-[11px] tracking-[0.22em] uppercase text-porcelain/80 mb-4">{eyebrow}</p>}
        <h1 className="font-display leading-[0.92] tracking-[-0.01em] text-[56px] sm:text-[72px] lg:text-[112px]">
          <KineticLine text={HERO.headline} />
          <br />
          <KineticLine text={HERO.headlineItalic} italic delay={0.25} />
        </h1>
        <p className="mt-4 max-w-[34ch] text-[15px] leading-snug text-porcelain/85">{MANIFESTO.lines[0]}</p>
        {/* The one action is the piece she is wearing. A visitor from a reel
            tapped a kurta, not a slogan: in the week of 13 Oct 2026 the
            "Swipe the drop" button got 14 taps and the thin credit line 2,
            from 2,029 visits. Now the button names the piece, its price and
            the sizes she can buy, and the drop is one scroll below. */}
        <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
          {lead ? (
            <Link
              href={`/product/${lead.id}`}
              data-track="hero_piece"
              onClick={() => markOpenSource("hero")}
              className="inline-flex items-center gap-2 min-h-12 px-6 py-3 rounded-full bg-burgundy text-porcelain text-sm font-semibold active:scale-[0.98] transition-transform"
            >
              <span>
                {HERO.credit}: {shortName(lead.name)} · {formatPrice(lead.base_price)}
                {!BROWSE_ONLY && sizes.length > 0 && <span className="block text-[11px] font-normal text-porcelain/80 tracking-wide">{sizes.length > 1 ? `${sizes[0]} to ${sizes[sizes.length - 1]}` : `only ${sizes[0]} left`}</span>}
              </span>
              <ArrowRight className="w-4 h-4 shrink-0" aria-hidden />
            </Link>
          ) : null}
          <button
            type="button"
            data-track="hero_cta"
            onClick={scrollToDrop}
            className="inline-flex items-center gap-1.5 min-h-[44px] text-[13px] text-porcelain/85 underline underline-offset-4 decoration-porcelain/40"
          >
            {HERO.cta} <ArrowDown className="w-3.5 h-3.5" aria-hidden />
          </button>
        </div>
      </div>
    </section>
  );
}

// ── Section chrome ───────────────────────────────────────────────────────────

/** Marks a part of the page so the console can say what share of visits reach it. */
function Seen({ name, children }: { name: string; children: React.ReactNode }) {
  const ref = useSectionView<HTMLDivElement>(name);
  return <div ref={ref}>{children}</div>;
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return <p className="text-[11px] tracking-[0.22em] uppercase text-burgundy mb-3">{children}</p>;
}

// ── The drop, one below the other ────────────────────────────────────────────

function DropFeed({ pieces }: { pieces: Product[] }) {
  const ordered = useMemo(() => feedOrder(pieces), [pieces]);
  const last = useRef<HTMLLIElement>(null);
  const sent = useRef(false);
  useEffect(() => {
    // Once, when the last piece has been on screen: the vertical twin of
    // the old "swiped to the last piece".
    const el = last.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting) && !sent.current) {
        sent.current = true;
        trackEvent("cta_click", { name: "drop_scroll_to_end", page: "home" });
        io.disconnect();
      }
    }, { threshold: 0.4 });
    io.observe(el);
    return () => io.disconnect();
  }, [ordered.length]);

  return (
    <ul className="px-5 lg:px-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-10 lg:gap-y-14" aria-label="The drop">
      {ordered.map((p, i) => (
        <li key={p.id} ref={i === ordered.length - 1 ? last : undefined}>
          <ProductCard product={p} markNew={false} sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" showSizes />
        </li>
      ))}
    </ul>
  );
}

// ── Fit ──────────────────────────────────────────────────────────────────────

function Fit({ lead }: { lead: Product | undefined }) {
  return (
    <section className="px-5 lg:px-12 py-16 lg:py-24 bg-rose">
      <Reveal className="lg:grid lg:grid-cols-[auto_1fr] lg:gap-16 lg:items-end max-w-5xl">
        <div>
          <Eyebrow>The fit, honestly</Eyebrow>
          <p className="font-display text-ink leading-none text-[88px] sm:text-[112px] lg:text-[148px]">
            {FOUNDER.heightCm}<span className="text-[0.4em] align-top ml-1">cm</span>
          </p>
        </div>
        <div className="mt-5 lg:mt-0 max-w-[46ch]">
          <p className="text-[15px] leading-relaxed text-ink">{FOUNDER.modelNote}</p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            Between sizes? Every piece has a size finder that works from what you already wear - and your measurements never leave your phone.
          </p>
          {lead && (
            <Link href={`/product/${lead.id}`} data-track="fit_find_size" className="mt-4 inline-flex items-center gap-2 min-h-[44px] text-sm font-semibold text-ink underline underline-offset-4 decoration-burgundy/50">
              Find your size <ArrowRight className="w-4 h-4" aria-hidden />
            </Link>
          )}
        </div>
      </Reveal>
    </section>
  );
}

// ── The receipt ──────────────────────────────────────────────────────────────

function Receipt() {
  const rows: Array<[string, string]> = [
    ["The price you see", "includes GST. Nothing is added at the end."],
    ["Shipping", `free when you pay online · ₹${POLICY_TERMS.codShippingRupees} if you pay on delivery`],
    ["Wrong size?", `raise an exchange within ${POLICY_TERMS.exchangeRaiseWindowHours} hours of delivery`],
    ["Leaves us", `in ${POLICY_TERMS.dispatchTimeframe}`],
    ["Reaches you", `in ${POLICY_TERMS.deliveryTimeframe}`],
  ];
  return (
    <section className="px-5 lg:px-12 py-16 lg:py-24">
      <Reveal className="max-w-2xl">
        <Eyebrow>The receipts</Eyebrow>
        <h2 className="font-display text-ink text-[34px] sm:text-[44px] leading-[1.05]">No surprises at checkout.</h2>
        <dl className="mt-8 divide-y divide-line border-y border-line">
          {rows.map(([k, v]) => (
            <div key={k} className="py-4 grid grid-cols-[minmax(0,9rem)_1fr] gap-4">
              <dt className="text-sm text-muted">{k}</dt>
              <dd className="text-sm text-ink">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-4 text-xs text-muted">
          The full terms are on the <Link href="/shipping" data-track="receipts_shipping" className="underline underline-offset-2">shipping</Link> and{" "}
          <Link href="/refund" data-track="receipts_exchange" className="underline underline-offset-2">exchange</Link> pages.
        </p>
      </Reveal>
    </section>
  );
}

// ── The page ─────────────────────────────────────────────────────────────────

export default function GenZView({ initial, truth }: { initial?: ProductListResponse; truth: Truth }) {
  // Same params the server fetched, so the seed is used and then refreshed:
  // price and stock are never older than the visit.
  const { data } = useProducts({ limit: 12, sort_by: "shelf" }, initial);
  const pieces = useMemo(() => (data?.items ?? []).filter((p) => p.is_active), [data]);
  const lead = pieces[0];
  const styled = pieces.find((p) => (p.styling_notes?.length ?? 0) > 0);
  const wa = whatsappContactUrl();

  return (
    <div className="bg-porcelain text-ink">
      <Header />
      <Seen name="hero"><Hero lead={lead} truth={truth} /></Seen>

      {/* The gesture they already have in their thumb. */}
      {pieces.length > 0 && (
        <Seen name="stories">
        <section className="pt-8 pb-2" aria-label="Watch the pieces">
          <p className="px-5 lg:px-12 text-xs text-muted mb-3">Tap a circle to watch it worn.</p>
          <Stories products={pieces} />
        </section>
        </Seen>
      )}

      <Seen name="drop">
      <section id="drop" className="pt-12 pb-16 lg:pt-20 scroll-mt-14">
        <Reveal className="px-5 lg:px-12 mb-6 flex items-end justify-between gap-4">
          <div>
            <Eyebrow>The drop</Eyebrow>
            <h2 className="font-display text-ink text-[34px] sm:text-[44px] leading-[1.05]">
              {pieces.length === 1 ? "One piece. Worn by her." : `${pieces.length} pieces. Worn by her.`}
            </h2>
          </div>
          <Link href="/shop" data-track="drop_see_all" className="shrink-0 inline-flex items-center min-h-[44px] text-sm text-ink underline underline-offset-4 decoration-burgundy/50">See all</Link>
        </Reveal>
        {pieces.length > 0 ? (
          <DropFeed pieces={pieces} />
        ) : (
          <p className="px-5 lg:px-12 text-sm text-muted">The next drop is being photographed.</p>
        )}
        {BROWSE_ONLY && (
          <p className="px-5 lg:px-12 mt-6 text-xs text-muted">Browse now - ordering opens soon.</p>
        )}
      </section>
      </Seen>

      {/* Coupons are advertised, not just accepted (CLAUDE.md): the
          tickets live on the home page. Renders nothing when there are none. */}
      <Seen name="offers"><DealsRail /></Seen>

      <Seen name="fit"><Fit lead={lead} /></Seen>

      {styled && (
        <Seen name="ways">
        <section className="px-5 lg:px-12 py-16 lg:py-24">
          <Reveal className="max-w-2xl">
            <Eyebrow>One piece, every day</Eyebrow>
            <h2 className="font-display text-ink text-[34px] sm:text-[44px] leading-[1.05] mb-6">
              Ways to wear {shortName(styled.name)}.
            </h2>
            <WaysToWear notes={styled.styling_notes} />
          </Reveal>
        </section>
        </Seen>
      )}

      <Seen name="receipts"><Receipt /></Seen>

      {lead && (
        <Seen name="mark">
        <section className="px-5 lg:px-12 py-16 lg:py-24 bg-rose">
          <Reveal className="max-w-2xl">
            <Eyebrow>Its ZISUN mark</Eyebrow>
            <h2 className="font-display text-ink text-[34px] sm:text-[44px] leading-[1.05]">Drawn from its colours. Yours on the tag.</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted max-w-[46ch]">
              Every piece carries a pattern made from its own colours, and a number no other piece shares.
            </p>
            <div className="mt-8">
              <PieceWeave productId={lead.id} colours={colours(lead)} />
            </div>
          </Reveal>
        </section>
        </Seen>
      )}

      {wa && (
        <Seen name="ask">
        <section className="px-5 lg:px-12 py-16 lg:py-24">
          <Reveal className="max-w-2xl">
            <Eyebrow>Talk to a person</Eyebrow>
            <h2 className="font-display text-ink text-[34px] sm:text-[44px] leading-[1.05]">Ask {FOUNDER.name}. She answers.</h2>
            <p className="mt-3 text-sm leading-relaxed text-muted max-w-[46ch]">
              Fit, fabric, a photo in daylight, whether it works for a wedding - send a message. No bot in between.
            </p>
            <a
              href={wa}
              target="_blank"
              rel="noopener noreferrer"
              data-track="ask_whatsapp"
              onClick={() => recordEnquiry({ source: "home" })}
              className="mt-7 inline-flex items-center gap-2 h-12 px-6 rounded-full bg-burgundy text-porcelain text-sm font-semibold active:scale-[0.98] transition-transform"
            >
              <MessageCircle className="w-4 h-4" aria-hidden /> Message on WhatsApp
            </a>
          </Reveal>
        </section>
        </Seen>
      )}

      {/* Policy links must be reachable from the home page itself: Google's
          app verification and Razorpay's onboarding both look here. */}
      <LegalFooter line={shortLine(truth)} />
    </div>
  );
}
