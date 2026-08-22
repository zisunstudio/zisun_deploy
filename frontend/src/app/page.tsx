"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  ShoppingBag, Search, User, Truck, RefreshCcw,
  Leaf, Sun, Home, Grid3X3, Heart, ChevronRight,
} from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import BottomSheet from "@/components/BottomSheet";
import CartDrawer from "@/components/CartDrawer";
import { CategoryCard } from "@/components/CategoryCard";
import { CategoryCardSkeleton } from "@/components/skeletons/Skeleton";
import { useCartStore } from "@/store/useCartStore";
import { useCategories, useFeed } from "@/lib/queries/catalog";
import { FeedCard, FeedItem } from "@/components/FeedCard";
import { trackEvent } from "@/lib/queries/analytics";
import { BROWSE_ONLY } from "@/lib/launchMode";

// Every claim here is read as a promise. Three of the previous four were not
// ones we could keep:
//   "Trusted by 10K+ customers" — invented. The store has had no customers.
//   "100% secure checkout"      — there is no checkout; it 503s by design.
//   "Free Shipping above Rs 999" — the shipping policy promises no such thing.
//                                  It says charges are shown at checkout.
// What remains is true today and consistent with the policy pages.
const TRUST_BADGES = [
  { Icon: Truck, title: "Ships across India", subtitle: "Shiprocket partners" },
  { Icon: RefreshCcw, title: "7-day returns", subtitle: "From delivery" },
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
  const [activeDot, setActiveDot] = useState(0);
  const [heroSrc, setHeroSrc] = useState(HERO_IMAGE);
  const [feedPage, setFeedPage] = useState(1);
  const [allFeedItems, setAllFeedItems] = useState<FeedItem[]>([]);
  const [hasMore, setHasMore] = useState(true);
  const toggleCart = useCartStore((state) => state.toggleCart);
  const cartItemsCount = useCartStore((state) => state.items.length);
  const { data: categories, isLoading: loadingCategories } = useCategories();
  const { data: feedData } = useFeed(feedPage);
  const heroRef = useRef<HTMLDivElement>(null);
  const feedParentRef = useRef<HTMLDivElement>(null);

  // Accumulate feed pages
  useEffect(() => {
    if (!feedData?.items) return;
    setAllFeedItems((prev) => {
      const existingIds = new Set(prev.map((i) => i.id));
      const newItems = feedData.items.filter((i: FeedItem) => !existingIds.has(i.id));
      return [...prev, ...newItems];
    });
    if (feedData.items.length < (feedData.limit ?? 20)) {
      setHasMore(false);
    }
  }, [feedData]);

  // Track hero feed item view
  useEffect(() => {
    const firstItem = allFeedItems[0];
    if (!firstItem) return;
    trackEvent("content_viewed", { item_id: firstItem.id });
  }, [allFeedItems]);

  // Virtualizer for the feed section
  const virtualizer = useVirtualizer({
    count: allFeedItems.length,
    getScrollElement: () => feedParentRef.current,
    estimateSize: () => (typeof window !== "undefined" ? window.innerHeight : 700),
    overscan: 2,
  });

  // Load more when near the end
  const handleFeedScroll = useCallback(() => {
    const el = feedParentRef.current;
    if (!el || !hasMore) return;
    const nearEnd = el.scrollTop + el.clientHeight >= el.scrollHeight - el.clientHeight * 1.5;
    if (nearEnd) {
      setFeedPage((p) => p + 1);
    }
  }, [hasMore]);

  // The cart tab is the last checkout entry point in the chrome. In preview
  // there is nothing it could lead to, so it is removed rather than disabled —
  // a tab that opens an empty drawer with no way out is worse than no tab.
  const NAV_ITEMS = [
    { Icon: Home, label: "Home", id: "home", href: "/" },
    { Icon: Grid3X3, label: "Shop", id: "shop", href: "/shop" },
    // Wishlist, Cart and Profile all need a signed-in user, and browse mode has
    // no working login. Tabs that can only bounce the visitor back here are
    // worse than no tabs, so the nav shrinks to what actually works.
    ...(BROWSE_ONLY ? [] : [
      { Icon: Heart, label: "Wishlist", id: "wishlist", href: "/wishlist" },
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
    <div className="h-full w-full flex flex-col bg-background">
      <div className="flex-1 overflow-y-auto no-scrollbar relative">

        {/* Header — absolute over hero */}
        {/* Scrim: the header sits over an arbitrary photograph, so legibility
            cannot depend on that photograph happening to be light at the top. */}
        <div className="absolute top-0 inset-x-0 h-32 z-[5] bg-gradient-to-b from-black/45 to-transparent pointer-events-none" />
        <header className="absolute top-0 w-full px-5 pt-5 z-10 flex justify-between items-start">
          <div>
            <h1 className="font-serif text-2xl font-bold text-white leading-none tracking-wide drop-shadow-[0_1px_6px_rgba(0,0,0,0.55)]">
              ZISUN
            </h1>
            <p className="text-white/90 text-[9px] font-semibold tracking-[0.22em] uppercase mt-0.5 drop-shadow-[0_1px_4px_rgba(0,0,0,0.6)]">
              Cotton made for your climate
            </p>
          </div>
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

        {/* Hero */}
        <div ref={heroRef} className="relative h-[72vh] lg:h-[60vh]">
          {allFeedItems[0] ? (
            <div className="absolute inset-0">
              <FeedCard item={allFeedItems[0]} />
            </div>
          ) : (
            <>
              <Image
                src={heroSrc}
                alt="Handwoven South Indian cotton"
                fill
                priority
                sizes="100vw"
                onError={() => setHeroSrc(HERO_FALLBACK)}
                className="object-cover object-[50%_20%]"
              />
              <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/50" />

              <div className="absolute bottom-10 left-5 z-10">
                <h2 className="font-serif text-[2.4rem] font-bold text-white leading-tight mb-2 drop-shadow-sm">
                  Cotton made for<br />your climate
                </h2>
                <p className="text-white/85 text-sm mb-5 max-w-[19rem] leading-snug">
                  Handwoven South Indian cotton, cut for the way you actually live.
                </p>
                <button
                  onClick={() => setIsSheetOpen(true)}
                  className="bg-[#5C3317] text-white px-7 py-3.5 rounded-full inline-flex items-center gap-2 font-semibold text-sm hover:bg-[#4A2810] transition-colors shadow-lg"
                >
                  Shop the Look
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex gap-2 z-10">
                {[0, 1, 2, 3].map((i) => (
                  <button
                    key={i}
                    onClick={() => setActiveDot(i)}
                    aria-label={`Go to slide ${i + 1}`}
                    className={`rounded-full transition-all duration-300 ${
                      activeDot === i ? "w-5 h-2 bg-white" : "w-2 h-2 bg-white/40"
                    }`}
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* Trust badges */}
        <div className="mx-4 lg:mx-auto lg:max-w-3xl -mt-5 relative z-10 bg-white rounded-2xl shadow-md px-3 py-4 lg:py-6 grid grid-cols-4 gap-1 lg:gap-6">
          {TRUST_BADGES.map(({ Icon, title, subtitle }) => (
            <div key={title} className="flex flex-col items-center text-center gap-1">
              <div className="w-8 h-8 rounded-full bg-[#F7F0E8] flex items-center justify-center">
                <Icon className="w-3.5 h-3.5 text-primary" strokeWidth={1.8} />
              </div>
              <span className="text-foreground text-[10px] font-semibold leading-tight">{title}</span>
              <span className="text-muted text-[8.5px] leading-tight">{subtitle}</span>
            </div>
          ))}
        </div>

        {/* Shop by Category — real data */}
        <div className="mt-6 px-5">
          <div className="flex justify-between items-center mb-3">
            <h3 className="font-serif text-xl font-bold text-foreground">Shop by Category</h3>
            <button
              onClick={() => router.push("/shop")}
              className="text-primary text-sm font-medium flex items-center gap-0.5 hover:underline"
            >
              View all <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
            {loadingCategories
              ? Array(4).fill(0).map((_, i) => <CategoryCardSkeleton key={i} />)
              : categories?.map((cat) => <CategoryCard key={cat.id} category={cat} />)
            }
          </div>
        </div>

        {/* Virtualized Feed */}
        {allFeedItems.length > 1 && (
          <div className="mt-6 px-5">
            <h3 className="font-serif text-xl font-bold text-foreground mb-3">Latest Drops</h3>
          </div>
        )}
        {allFeedItems.length > 1 && (
          <div
            ref={feedParentRef}
            onScroll={handleFeedScroll}
            style={{ height: "100vh", overflow: "auto" }}
            className="no-scrollbar"
          >
            <div style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}>
              {virtualizer.getVirtualItems().map((virtualItem) => {
                const feedItem = allFeedItems[virtualItem.index];
                return (
                  <div
                    key={virtualItem.key}
                    style={{
                      position: "absolute",
                      top: 0,
                      left: 0,
                      width: "100%",
                      height: `${virtualItem.size}px`,
                      transform: `translateY(${virtualItem.start}px)`,
                    }}
                  >
                    <FeedCard item={feedItem} />
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="h-20" />
      </div>

      {/* Bottom nav */}
      <nav className="h-16 bg-white border-t border-gray-100 flex items-center justify-around lg:justify-center lg:gap-24 px-1 flex-shrink-0 shadow-[0_-4px_12px_rgba(0,0,0,0.05)]">
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
                isActive ? "text-primary" : "text-gray-400"
              }`}
            >
              <div className="relative">
                <Icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.2 : 1.8} />
                {isCart && cartItemsCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-primary text-white text-[8px] font-bold w-3.5 h-3.5 rounded-full flex items-center justify-center">
                    {cartItemsCount}
                  </span>
                )}
              </div>
              <span className={`text-[10px] ${isActive ? "font-semibold" : "font-medium"}`}>{label}</span>
              {isActive && (
                <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-5 h-[2.5px] bg-primary rounded-full" />
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
