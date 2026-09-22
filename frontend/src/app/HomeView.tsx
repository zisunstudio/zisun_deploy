"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { ShoppingBag, Search, User, Home, Grid3X3, Heart, ArrowUpRight } from "lucide-react";
import { CategoryCard } from "@/components/CategoryCard";
import { CategoryCardSkeleton, ProductCardSkeleton } from "@/components/skeletons/Skeleton";
import { ProductCard } from "@/components/ProductCard";
import { useCartStore } from "@/store/useCartStore";
import { useAuthStore } from "@/store/useAuthStore";
import { productImageUrl, useCategories, useFeed, useProducts, type Category, type ProductListResponse } from "@/lib/queries/catalog";
import { POLICY_TERMS } from "@/lib/legal";
import { DealsRail } from "@/components/DealsRail";
import { FeedItem, feedItemImage } from "@/components/FeedCard";
import { Reveal } from "@/components/Reveal";
import { CRAFT, HERO, LOOM, MANIFESTO, OCCASIONS, daypartAt } from "@/lib/brand";
import { Weave } from "@/components/Weave";
import { Stories } from "@/components/Stories";
import { navigate } from "@/lib/viewTransition";
import { SMALL_COLLECTION_AT } from "@/lib/brand";
import { markOpenSource } from "@/lib/enquiry";
import { trackEvent } from "@/lib/queries/analytics";
import { BROWSE_ONLY } from "@/lib/launchMode";
import { FIREBASE_ENABLED } from "@/lib/firebase";
import { LegalFooter } from "@/components/LegalFooter";
import { Wordmark } from "@/components/Wordmark";
import { FounderNote } from "@/components/FounderNote";

// Every claim on this page is read as a promise. What is here is true today
// and consistent with the policy pages; nothing about customer counts,
// checkout security or free shipping, because none of those are ours to say.

// LAUNCH IMAGERY — temporary, see CREDITS.md.
// A licensed photograph of a person wearing a kurti. It is editorial: it
// sets the mood and makes no claim to be a garment for sale, which is why
// people appear here and on the category cards but never on a product card
// next to a name, a price and a stock count.
//
// To revert after the launch video, point this back at
// /hero/home-hero.jpg — the cloth originals are still in the bucket.
//
// The local SVG stays as the fallback for when the CDN object is missing,
// so a deleted or renamed file degrades to branded artwork rather than a
// broken-image icon on the landing screen.
const HERO_IMAGE =
  "https://zisun-media.fly.storage.tigris.dev/launch/home-hero.jpg";
const HERO_FALLBACK = "/placeholder-hero.svg";

/**
 * The interactive home page, rendered inside the server shell in page.tsx.
 * `initial` is what the server already fetched, so the first paint - and a
 * crawler - has the real drop, feed and categories.
 */
export interface HomeInitial {
  drop?: ProductListResponse;
  feed?: ProductListResponse;
  categories?: Category[];
}

export default function HomeView({ initial = {} }: { initial?: HomeInitial }) {
  const router = useRouter();
  const [activeNav, setActiveNav] = useState("home");
  const [heroSrc, setHeroSrc] = useState(HERO_IMAGE);
  // Page 1 only for now. Eight products fit on one page; when the
  // catalogue outgrows that this becomes a "load more" rather than the
  // nested infinite scroller it used to be.
  const [feedPage] = useState(1);
  const [allFeedItems, setAllFeedItems] = useState<FeedItem[]>([]);
  const toggleCart = useCartStore((state) => state.toggleCart);
  const cartItemsCount = useCartStore((state) => state.items.length);
  const { data: categories, isLoading: loadingCategories } = useCategories(initial.categories);
  const { data: feedData, isLoading: loadingFeed } = useFeed(feedPage, feedPage === 1 ? initial.feed : undefined);
  // The drop: six pieces in shelf order. The feed decides the hero; the
  // shelf decides what is shown beneath it, so a pinned piece leads the grid.
  const { data: dropData, isLoading: loadingDrop } = useProducts({ limit: 6, sort_by: "shelf" }, initial.drop);
  const heroRef = useRef<HTMLDivElement>(null);
  // Her clock, read after mount: the server has no idea what time it is for
  // her, and guessing would flash the wrong greeting before correcting it.
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); }, []);
  const daypart = now ? daypartAt(now.getHours()) : null;
  // Today's cloth: the colours of whatever is in the drop, seeded by the
  // date, so the loom weaves something new every day without anyone
  // touching it.
  const loomColours = Array.from(new Set((dropData?.items ?? []).flatMap((p) => p.variants.map((v) => v.color)).filter(Boolean))) as string[];
  // "NEW" tells her which pieces are new. When every piece is, it tells her
  // nothing and reads as a sticker on a stall.
  const allNew = (dropData?.items ?? []).length > 0 && (dropData?.items ?? []).every((p) => Date.now() - new Date(p.created_at).getTime() < 14 * 86400000);
  const loomSeed = now ? `zisun-${now.getFullYear()}-${now.getMonth() + 1}-${now.getDate()}` : null;
  const loomDate = now ? now.toLocaleDateString("en-IN", { day: "numeric", month: "long" }) : "";
  const isSignedIn = useAuthStore((s) => s.isAuthenticated());

  // Accumulate feed pages
  useEffect(() => {
    if (!feedData?.items) return;
    setAllFeedItems((prev) => {
      const existingIds = new Set(prev.map((i) => i.id));
      const newItems = feedData.items.filter((i: FeedItem) => !existingIds.has(i.id));
      return [...prev, ...newItems];
    });
    if (feedData.items.length < (feedData.limit ?? 20)) {
    }
  }, [feedData]);

  // Track hero feed item view
  useEffect(() => {
    const firstItem = allFeedItems[0];
    if (!firstItem) return;
    trackEvent("content_viewed", { item_id: firstItem.id });
  }, [allFeedItems]);

  // Virtualizer for the feed section

  // Load more when near the end

  // The cart tab is the last checkout entry point in the chrome. In preview
  // there is nothing it could lead to, so it is removed rather than disabled —
  // a tab that opens an empty drawer with no way out is worse than no tab.
  const NAV_ITEMS = [
    { Icon: Home, label: "Home", id: "home", href: "/" },
    { Icon: Grid3X3, label: "Collection", id: "shop", href: "/shop" },
    // Wishlist needs an account, which now exists — so it comes back as soon
    // as sign-in is configured, launch mode notwithstanding. Someone browsing
    // before the store opens can still save what they want.
    ...(FIREBASE_ENABLED ? [
      { Icon: Heart, label: "Wishlist", id: "wishlist", href: "/wishlist" },
    ] : []),
    // Cart and Profile stay out until commerce opens: the cart leads to a
    // checkout that cannot take an order, and profile is mostly addresses,
    // which only matter once there is something to deliver.
    // The bag is back in browse mode: it now ends in a WhatsApp order rather
    // than a checkout, so it leads somewhere. Profile stays out until there
    // are orders to show.
    { Icon: ShoppingBag, label: "Bag", id: "cart", href: null },
    // Account, always. Signed out this is the only route to sign-in; signed
    // in it is the only route to sign-out.
    { Icon: User, label: isSignedIn ? "Account" : "Sign in", id: "profile", href: isSignedIn ? "/profile" : "/login" },
  ];

  // The hero's photograph and credit line come from the first feed item,
  // which is a published Content card when one exists and the shelf's first
  // product otherwise. That is how the founder art-directs the opening screen.
  const FEATURED = allFeedItems[0];
  const featuredId = FEATURED?.products?.[0]?.id ?? FEATURED?.id;
  const featuredName = FEATURED?.products?.[0]?.name ?? FEATURED?.name ?? null;

  function handleNavClick(id: string, href: string | null) {
    if (id === "cart") {
      toggleCart();
    } else {
      setActiveNav(id);
      if (href) router.push(href);
    }
  }

  return (
    <div className="w-full bg-background">
      <div className="relative">

        {/* Header — absolute over hero */}
        {/* Scrim: the header sits over an arbitrary photograph, so legibility
            cannot depend on that photograph happening to be light at the top. */}
        <div className="absolute top-0 inset-x-0 h-32 z-[5] bg-gradient-to-b from-black/45 to-transparent pointer-events-none" />
        <header className="absolute top-0 w-full px-5 pt-5 z-10 flex justify-between items-start">
          <div>
            {/* The strapline used to repeat the hero headline word for word.
                The tagline says something the headline does not. */}
            <Wordmark tone="light" size="md" animate />
          </div>

          {/* Desktop nav. Same destinations and the same click handler as the
              tab bar, so the cart still opens the drawer rather than routing. */}
          <nav className="hidden lg:flex items-center gap-9 mt-1">
            {NAV_ITEMS.map(({ label, id, href }) => (
              <button
                key={id}
                onClick={() => handleNavClick(id, href)}
                className={`text-sm font-medium text-white/90 hover:text-white transition-colors drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)] ${
                  activeNav === id ? "text-white underline underline-offset-8 decoration-2" : ""
                }`}
              >
                {label}
                {id === "cart" && cartItemsCount > 0 && (
                  <span key={cartItemsCount} className="ml-1.5 inline-block text-[10px] font-bold motion-safe:animate-pop">({cartItemsCount})</span>
                )}
              </button>
            ))}
          </nav>

          <div className="flex gap-2 mt-0.5">
            <button
              onClick={() => router.push("/search")}
              className="w-10 h-10 rounded-full bg-white/85 backdrop-blur-sm flex items-center justify-center shadow-sm border border-white/70"
              aria-label="Search"
            >
              <Search className="w-4 h-4 text-foreground" />
            </button>
            {/* Always present. It used to be hidden in browse mode, which left
                the storefront with no way to sign in and no way to sign out -
                /login existed but nothing pointed at it. Signed out it opens
                sign-in; signed in it opens the account. */}
            {(
              <button
                onClick={() => router.push(isSignedIn ? "/profile" : "/login")}
                className="w-10 h-10 rounded-full bg-white/85 backdrop-blur-sm flex items-center justify-center shadow-sm border border-white/70"
                aria-label={isSignedIn ? "Your account" : "Sign in"}
              >
                <User className="w-4 h-4 text-foreground" />
              </button>
            )}
          </div>
        </header>

        {/* Hero.
            One photograph, one line, one action. The photograph is the
            featured piece's; the words are the label's. The piece appears as
            a credit line under the action, the way a magazine credits what
            the model wears - it is a credit, not the subject.
            Three image states: a quiet placeholder while the feed is in
            flight, so the page never paints one hero and then swaps it. */}
        <div ref={heroRef} className="relative min-h-[86svh] lg:min-h-[82vh] bg-rose">
          {FEATURED ? (
            <Image src={feedItemImage(FEATURED)} alt="" fill priority sizes="100vw" className="object-cover object-[50%_22%] lg:object-[50%_35%]" />
          ) : loadingFeed ? (
            <div className="absolute inset-0 bg-rose animate-pulse" aria-hidden="true" />
          ) : (
            <Image src={heroSrc} alt="Handwoven South Indian cotton" fill priority sizes="100vw" onError={() => setHeroSrc(HERO_FALLBACK)} className="object-cover object-[50%_20%]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/15 to-transparent" />
          {FEATURED && (
            <button
              type="button"
              aria-label="Open the featured piece"
              onClick={() => { markOpenSource("hero"); navigate(router, `/product/${featuredId}`, { from: heroRef.current }); }}
              className="absolute inset-0 w-full h-full cursor-pointer"
            />
          )}
          <div className="absolute inset-x-0 bottom-0 z-10 px-5 lg:px-8 pb-12 lg:pb-16 pointer-events-none">
            <div className="max-w-6xl mx-auto w-full">
              <p className="text-white/80 text-[11px] font-semibold uppercase tracking-[0.24em] animate-fade-up">{HERO.eyebrow}</p>
              <h1 className="mt-3 font-display text-white text-[52px] leading-[0.95] lg:text-[104px] text-balance animate-fade-up [animation-delay:90ms]">
                {HERO.headline}<br />
                <em className="italic">{HERO.headlineItalic}</em>
              </h1>
              <p className="mt-4 text-white/85 text-[15px] leading-snug max-w-[20rem] lg:max-w-md lg:text-[17px] animate-fade-up [animation-delay:180ms]">{HERO.sub}</p>
              <div className="mt-7 flex flex-col items-start gap-4 pointer-events-auto animate-fade-up [animation-delay:270ms]">
                <button
                  onClick={() => router.push("/shop")}
                  className="bg-white text-burgundy px-7 py-3.5 rounded-full inline-flex items-center gap-2 font-semibold text-sm hover:-translate-y-0.5 transition-transform"
                >
                  {HERO.cta}
                  <ArrowUpRight className="w-4 h-4" />
                </button>
                {FEATURED && featuredName && (
                  <button
                    onClick={() => { markOpenSource("hero"); navigate(router, `/product/${featuredId}`, { from: heroRef.current }); }}
                    className="text-white/75 text-[12px] tracking-wide hover:text-white underline-offset-4 hover:underline text-left"
                  >
                    {HERO.credit}: {featuredName} →
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Three quiet promises. Each is one the policy pages keep; the third
            says how an order happens today and changes when checkout opens.
            A three-column row rather than one dotted line: at phone width a
            single line broke mid-word, which is the opposite of quiet. */}
        <ul className="mx-auto max-w-3xl px-5 py-8 flex flex-wrap justify-center gap-x-5 gap-y-2 text-center text-[10px] lg:text-[11px] uppercase tracking-[0.16em] lg:tracking-[0.2em] text-muted leading-snug">
          {/* Each promise is one unbreakable unit; the row wraps between
              them. Three fixed columns broke "FREE SHIPPING / ON PREPAID" and
              "DISPATCHED IN 2- / 3 DAYS" mid-phrase on a 412px screen. */}
          {["Free shipping on prepaid", `Dispatched in ${POLICY_TERMS.dispatchTimeframe.replace(" business", "")}`, BROWSE_ONLY ? "Orders on WhatsApp" : "UPI, cards, netbanking"].map((line) => (
            <li key={line} className="whitespace-nowrap">{line}</li>
          ))}
        </ul>

        {/* The part of the day she is in. One line in serif, reserved at a
            fixed height so it arrives without moving the page. */}
        <div className="px-5 min-h-[72px] lg:min-h-[60px] flex items-center justify-center" aria-live="off">
          {daypart && (
            <p className="max-w-md text-center font-display text-[21px] lg:text-[24px] leading-[1.25] text-ink text-balance animate-fade-up">
              {daypart.greeting} <em className="italic text-muted">{daypart.line}</em>
            </p>
          )}
        </div>

        {/* The drop as stories - the browsing gesture already in her thumb.
            Built from the drop query below, so it costs no extra request. */}
        <div className="mt-2 mb-2">
          <Stories products={dropData?.items ?? []} />
        </div>

        <DealsRail />

        {/* The drop: six pieces, photograph, name, price. No buttons - the
            photograph is the argument, and a button under every one of them
            made each button worthless. */}
        <Reveal className="mt-14 lg:mt-24 px-5 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="flex justify-between items-end mb-6 lg:mb-8">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-burgundy">This week</p>
                <h2 className="font-display text-[34px] lg:text-[44px] leading-none text-ink mt-1.5">The drop</h2>
              </div>
              {/* Only when there is more than the drop shows. "Everything"
                  over two pieces leads to a page of the same two. */}
              {(dropData?.total ?? 0) > Math.max(SMALL_COLLECTION_AT, dropData?.items.length ?? 0) && (
                <button onClick={() => router.push("/shop")} className="text-ink text-sm hover:underline underline-offset-4 pb-1">
                  Everything →
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-8 lg:gap-x-8 lg:gap-y-12">
              {loadingDrop
                ? Array(6).fill(0).map((_, i) => <ProductCardSkeleton key={i} />)
                : (dropData?.items ?? []).map((product) => <ProductCard key={product.id} product={product} markNew={!allNew} />)}
            </div>
          </div>
        </Reveal>

        {/* What the label is for. Three lines of serif with air around them,
            between the drop and the categories, so the visitor meets the
            point of view before the taxonomy. */}
        {/* The loom. Full-bleed, in the colours of the drop above it, and
            woven by the scroll: the weft advances as she moves down the page.
            It sits directly over the label's statement so the cloth finishes
            as the words arrive. Not inside a Reveal - it has its own entrance
            and a fade on top of a weave is two ideas. */}
        {loomSeed && (
          <section className="mt-24 lg:mt-36" aria-labelledby="loom-heading">
            <div className="px-5 lg:px-8 max-w-6xl mx-auto flex items-end justify-between gap-4 mb-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-burgundy">{LOOM.eyebrow} · {loomDate}</p>
                <h2 id="loom-heading" className="font-display text-[34px] lg:text-[44px] leading-none text-ink mt-1.5">{LOOM.heading}</h2>
              </div>
            </div>
            <div className="h-[46svh] min-h-[280px] lg:h-[52vh] bg-rose">
              <Weave seed={loomSeed} colours={loomColours} mode="scroll" cols={84} rows={60} label="Today's pattern, drawn from the colours of this week's pieces, woven as you scroll" />
            </div>
            <p className="px-5 lg:px-8 max-w-6xl mx-auto mt-4 text-[13px] leading-relaxed text-muted">
              {LOOM.body} <span className="text-ink">{LOOM.touch}</span>
            </p>
          </section>
        )}

        <Reveal className="mt-20 lg:mt-28 px-5 lg:px-8">
          <div className="max-w-3xl mx-auto text-center">
            <p className="font-display text-[30px] lg:text-[48px] leading-[1.1] text-ink text-balance">
              {MANIFESTO.lines.map((line, i) => (
                <span key={i} className={i === 1 ? "italic" : ""}>{line}{i < MANIFESTO.lines.length - 1 ? " " : ""}</span>
              ))}
            </p>
            <p className="mt-6 text-[15px] lg:text-base leading-relaxed text-muted max-w-xl mx-auto">{MANIFESTO.body}</p>
          </div>
        </Reveal>

        {/* Who this is for, straight after what we believe: the manifesto is
            the label's point of view and her note is the woman behind it -
            one beat, not two. It used to sit last, after the craft facts,
            which put trust before identity. */}
        <FounderNote />

        {/* Categories, as occasions. The founder's description under each
            name is the mood line; the page asks the question. A category with
            nothing in it yet stays off the home page - a door to an empty
            room is worse than no door. */}
        {(loadingCategories || (categories ?? []).some((c) => c.product_count > 0)) && (
        <Reveal className="mt-24 lg:mt-36 px-5 lg:px-8">
          <div className="max-w-6xl mx-auto">
            <div className="mb-6 lg:mb-8">
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-burgundy">{OCCASIONS.eyebrow}</p>
              <h2 className="font-display text-[34px] lg:text-[44px] leading-none text-ink mt-1.5">{OCCASIONS.heading}</h2>
            </div>
            <div className="flex gap-4 overflow-x-auto no-scrollbar -mx-5 px-5 pb-2 lg:mx-0 lg:px-0 lg:grid lg:grid-cols-3 lg:gap-8 lg:overflow-visible">
              {loadingCategories
                ? Array(3).fill(0).map((_, i) => <CategoryCardSkeleton key={i} />)
                : categories?.filter((c) => c.product_count > 0).map((cat) => (
                    <CategoryCard
                      key={cat.id}
                      category={cat}
                      // A photograph of a piece in this category, on her.
                      pieceImage={(dropData?.items ?? []).filter((p) => p.category_id === cat.id).map(productImageUrl)[0] ?? null}
                    />
                  ))}
            </div>
          </div>
        </Reveal>
        )}

        {/* Made of. Three facts about the cloth, as type. */}
        <Reveal className="mt-24 lg:mt-36 px-5 lg:px-8">
          <div className="max-w-6xl mx-auto border-t border-ink/10 pt-10 lg:pt-14 grid gap-10 lg:grid-cols-3 lg:gap-12">
            {CRAFT.map((c) => (
              <div key={c.title}>
                <p className="font-display text-[24px] lg:text-[28px] leading-tight text-ink">{c.title}</p>
                <p className="mt-2.5 text-[14px] leading-relaxed text-muted max-w-xs">{c.body}</p>
              </div>
            ))}
          </div>
        </Reveal>


        {/* The policy links have to be reachable from the home page itself:
            Google's app verification and Razorpay's onboarding both look
            for them here. */}
        <LegalFooter />

        {/* Clears the fixed tab bar, which only exists below lg. */}
        <div className="h-20 lg:h-0 bg-burgundy" />
      </div>
      {/* Bottom tab bar - phones and tablets only. It is a touch pattern:
          at 1440px it reads as a stray mobile chrome pinned across the
          foot of a wide window. Desktop gets the same destinations in the
          header instead. */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 h-16 max-w-md mx-auto bg-white/90 backdrop-blur-md border-t border-line flex items-center justify-around px-1 shadow-[0_-4px_16px_rgba(26,20,23,0.06)]">
        {NAV_ITEMS.map(({ Icon, label, id, href }) => {
          const isCart = id === "cart";
          const isActive = activeNav === id && !isCart;
          return (
            <button
              key={id}
              onClick={() => handleNavClick(id, href)}
              aria-label={label}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 relative transition-colors ${
                isActive ? "text-ink" : "text-ink/40"
              }`}
            >
              <div className="relative">
                <Icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.2 : 1.8} />
                {isCart && cartItemsCount > 0 && (
                  <span key={cartItemsCount} className="absolute -top-1.5 -right-1.5 bg-rani text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center motion-safe:animate-pop">
                    {cartItemsCount}
                  </span>
                )}
              </div>
              <span className={`text-[10px] ${isActive ? "font-semibold" : "font-medium"}`}>{label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1.5 h-1.5 bg-rani rounded-full" />
              )}
            </button>
          );
        })}
      </nav>

    </div>
  );
}
