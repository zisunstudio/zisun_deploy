"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ShoppingBag, Search, User, Truck, RefreshCcw,
  Leaf, Sun, Home, Grid3X3, Heart, ChevronRight, ArrowUpRight,
} from "lucide-react";
import BottomSheet from "@/components/BottomSheet";
import CartDrawer from "@/components/CartDrawer";
import { CategoryCard } from "@/components/CategoryCard";
import { CategoryCardSkeleton } from "@/components/skeletons/Skeleton";
import { useCartStore } from "@/store/useCartStore";
import { useCategories, useFeed } from "@/lib/queries/catalog";
import { POLICY_TERMS } from "@/lib/legal";
import { DealsRail } from "@/components/DealsRail";
import { FeedCard, FeedItem, feedItemImage } from "@/components/FeedCard";
import { Ticker } from "@/components/Ticker";
import { Reveal } from "@/components/Reveal";
import { HERO } from "@/lib/brand";
import { trackEvent } from "@/lib/queries/analytics";
import { BROWSE_ONLY } from "@/lib/launchMode";
import { FIREBASE_ENABLED } from "@/lib/firebase";
import { LegalFooter } from "@/components/LegalFooter";
import { Wordmark } from "@/components/Wordmark";
import { FounderNote } from "@/components/FounderNote";

// Every claim here is read as a promise. Three of the previous four were not
// ones we could keep:
//   "Trusted by 10K+ customers" — invented. The store has had no customers.
//   "100% secure checkout"      — there is no checkout; it 503s by design.
//   "Free Shipping above Rs 999" — the shipping policy promises no such thing.
//                                  It says charges are shown at checkout.
// What remains is true today and consistent with the policy pages.
const TRUST_BADGES = [
  { Icon: Truck, title: "Ships across India", subtitle: "Shiprocket partners" },
  // Not "returns". We do not have a returns programme, and a badge on the home
  // page is exactly where an overstated promise does the most damage.
  { Icon: RefreshCcw, title: `${POLICY_TERMS.exchangeRaiseWindowHours}h size exchange`, subtitle: "Size issues only" },
  { Icon: Leaf, title: "Handloom cotton", subtitle: "Mangalgiri, Ilkal, Kasavu" },
  { Icon: Sun, title: "Built for the heat", subtitle: "Breathable weaves" },
];

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

export default function HomePage() {
  const router = useRouter();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const [activeNav, setActiveNav] = useState("home");
  const [heroSrc, setHeroSrc] = useState(HERO_IMAGE);
  // Page 1 only for now. Eight products fit on one page; when the
  // catalogue outgrows that this becomes a "load more" rather than the
  // nested infinite scroller it used to be.
  const [feedPage] = useState(1);
  const [allFeedItems, setAllFeedItems] = useState<FeedItem[]>([]);
  const toggleCart = useCartStore((state) => state.toggleCart);
  const cartItemsCount = useCartStore((state) => state.items.length);
  const { data: categories, isLoading: loadingCategories } = useCategories();
  const { data: feedData, isLoading: loadingFeed } = useFeed(feedPage);
  const heroRef = useRef<HTMLDivElement>(null);

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
    { Icon: Grid3X3, label: "Shop", id: "shop", href: "/shop" },
    // Wishlist needs an account, which now exists — so it comes back as soon
    // as sign-in is configured, launch mode notwithstanding. Someone browsing
    // before the store opens can still save what they want.
    ...(FIREBASE_ENABLED ? [
      { Icon: Heart, label: "Wishlist", id: "wishlist", href: "/wishlist" },
    ] : []),
    // Cart and Profile stay out until commerce opens: the cart leads to a
    // checkout that cannot take an order, and profile is mostly addresses,
    // which only matter once there is something to deliver.
    ...(BROWSE_ONLY ? [] : [
      { Icon: ShoppingBag, label: "Cart", id: "cart", href: null },
      { Icon: User, label: "Profile", id: "profile", href: "/profile" },
    ]),
  ];

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
                  <span className="ml-1.5 text-[10px] font-bold">({cartItemsCount})</span>
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
            {/* /profile redirects to / in browse mode, so this button would
                only ever reload the home screen. */}
            {!BROWSE_ONLY && (
              <button
                onClick={() => router.push("/profile")}
                className="w-10 h-10 rounded-full bg-white/85 backdrop-blur-sm flex items-center justify-center shadow-sm border border-white/70"
                aria-label="Profile"
              >
                <User className="w-4 h-4 text-foreground" />
              </button>
            )}
          </div>
        </header>

        {/* Hero.
            One photograph, one line, one button. The first feed item supplies
            the photograph and a way in ("this piece"), but the words are the
            brand's, not the product's: a hero that reads "Mangalgiri Kurti
            ₹1,499" is a listing, and a landing page is not a listing.
            Three image states, not two: a quiet placeholder holds the space
            while the feed is in flight, so the page never paints one hero and
            then swaps it for another. */}
        <div ref={heroRef} className="relative h-[78vh] min-h-[540px] lg:h-[64vh] lg:min-h-[560px] bg-rose">
          {allFeedItems[0] ? (
            <Image src={feedItemImage(allFeedItems[0])} alt="" fill priority sizes="100vw" className="object-cover object-[50%_25%]" />
          ) : loadingFeed ? (
            <div className="absolute inset-0 bg-rose animate-pulse" aria-hidden="true" />
          ) : (
            <Image src={heroSrc} alt="Handwoven South Indian cotton" fill priority sizes="100vw" onError={() => setHeroSrc(HERO_FALLBACK)} className="object-cover object-[50%_20%]" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/20 to-transparent" />
          {/* The tap target for the photograph itself: the featured piece. */}
          {allFeedItems[0] && (
            <button
              type="button"
              aria-label="Open the featured piece"
              onClick={() => router.push(`/product/${allFeedItems[0].products?.[0]?.id ?? allFeedItems[0].id}`)}
              className="absolute inset-0 w-full h-full cursor-pointer"
            />
          )}
          <div className="absolute inset-x-0 bottom-0 z-10 px-5 lg:px-8 pb-9 lg:pb-14 pointer-events-none">
            <div className="max-w-6xl mx-auto w-full">
              <p className="text-haldi text-[11px] font-semibold uppercase tracking-[0.24em] animate-fade-up">{HERO.eyebrow}</p>
              <h1 className="mt-2 font-display text-white text-[44px] leading-[0.95] lg:text-[84px] tracking-[-0.02em] text-balance drop-shadow-sm animate-fade-up [animation-delay:90ms]">
                {HERO.headline}<br />
                <em className="italic font-normal">{HERO.headlineItalic}</em>
              </h1>
              <p className="mt-4 text-white/85 text-[15px] leading-snug max-w-[22rem] lg:max-w-md lg:text-base animate-fade-up [animation-delay:180ms]">{HERO.sub}</p>
              <div className="mt-6 flex flex-wrap items-center gap-3 pointer-events-auto animate-fade-up [animation-delay:270ms]">
                <button
                  onClick={() => router.push("/shop")}
                  className="bg-white text-ink px-6 py-3.5 rounded-full inline-flex items-center gap-2 font-semibold text-sm shadow-lift hover:-translate-y-0.5 transition-transform"
                >
                  {HERO.cta}
                  <ArrowUpRight className="w-4 h-4" />
                </button>
                {allFeedItems[0] && (
                  <button
                    onClick={() => router.push(`/product/${allFeedItems[0].products?.[0]?.id ?? allFeedItems[0].id}`)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/40 bg-white/10 backdrop-blur-sm text-white px-4 py-3 text-[13px] font-medium hover:bg-white/20 transition-colors max-w-[60vw]"
                  >
                    <span className="truncate">This piece · {allFeedItems[0].products?.[0]?.name ?? allFeedItems[0].name ?? "shop"}</span>
                    <ChevronRight className="w-4 h-4 shrink-0" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* The ribbon. The promises, moving, in turmeric. */}
        <Ticker />

        {/* Trust, compact. Every claim here is one the policy pages keep. */}
        <div className="mx-auto max-w-3xl px-5 py-5 grid grid-cols-4 gap-2">
          {TRUST_BADGES.map(({ Icon, title, subtitle }) => (
            <div key={title} className="flex flex-col items-center text-center gap-1.5">
              <div className="w-9 h-9 rounded-full bg-rose flex items-center justify-center">
                <Icon className="w-4 h-4 text-ink" strokeWidth={1.8} />
              </div>
              <span className="text-ink text-[10.5px] font-semibold leading-tight">{title}</span>
              <span className="text-muted text-[9px] leading-tight">{subtitle}</span>
            </div>
          ))}
        </div>

        {/* Products first. This used to sit below the category rail, which put
            it 2.7 screens down a desktop page — the shop's landing page reached
            its first price after two and a half scrolls.

            It also used to be a virtualised list inside a 100vh scrolling box,
            nested inside the page's own scrolling box. A wheel over the feed
            scrolled one thing and a wheel beside it scrolled another. Eight
            products do not need virtualising; they need to be visible. */}
        <DealsRail />

        {allFeedItems.length > 0 && (
          <Reveal className="mt-10 px-5 lg:px-8">
            <div className="flex justify-between items-end mb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">This week</p>
                <h3 className="font-display text-[28px] leading-none text-ink mt-1">The <em className="italic font-normal">drop.</em></h3>
              </div>
              <button
                onClick={() => router.push("/shop")}
                className="text-ink text-sm font-medium flex items-center gap-0.5 hover:underline underline-offset-4"
              >
                See all <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            {/* Every fifth card from the third is a wide one on desktop: the
                grid breaks its own rhythm once a row, which is what makes it
                read as an editorial spread rather than a warehouse. */}
            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {allFeedItems.map((feedItem, i) => (
                <div key={feedItem.id} className={`overflow-hidden rounded-card shadow-soft ${i % 5 === 2 ? "lg:col-span-2" : ""}`}>
                  <FeedCard item={feedItem} className={i % 5 === 2 ? "aspect-[3/4] lg:aspect-[3/2]" : "aspect-[3/4]"} />
                </div>
              ))}
            </div>
          </Reveal>
        )}

        {/* Shop by Category — real data */}
        <Reveal className="mt-12 px-5 lg:px-8">
          <div className="flex justify-between items-end mb-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted">Wardrobe</p>
              <h3 className="font-display text-[28px] leading-none text-ink mt-1">By <em className="italic font-normal">kind.</em></h3>
            </div>
            <button
              onClick={() => router.push("/shop")}
              className="text-ink text-sm font-medium flex items-center gap-0.5 hover:underline underline-offset-4"
            >
              View all <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-3 -mx-5 px-5 lg:mx-0 lg:px-0">
            {loadingCategories
              ? Array(4).fill(0).map((_, i) => <CategoryCardSkeleton key={i} />)
              : categories?.map((cat) => <CategoryCard key={cat.id} category={cat} />)
            }
          </div>
        </Reveal>

        {/* Who is behind this. The survey's two biggest objections were "will
            the quality be there" and "can I send it back" - both are questions
            about whether anyone stands behind the cloth, and neither is
            answered by another product grid. One product travels with the note
            so the section ends somewhere to buy. */}
        <FounderNote feature={allFeedItems[0]} />

        {/* The policy links have to be reachable from the home page itself,
            not only from /shop. Google's app verification rejected the domain
            for exactly this: "your home page URL does not include a link to
            your privacy policy". Razorpay checks the same thing at onboarding,
            and the e-commerce rules require the policies to be findable. */}
        <LegalFooter />

        {/* Clears the fixed tab bar, which only exists below lg. */}
        <div className="h-20 lg:h-0 bg-ink" />
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
                  <span className="absolute -top-1.5 -right-1.5 bg-rani text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
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

      <BottomSheet isOpen={isSheetOpen} onClose={() => setIsSheetOpen(false)} />
      <CartDrawer />
    </div>
  );
}
