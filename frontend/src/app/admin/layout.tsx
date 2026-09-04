"use client";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { useEffect, useState } from "react";
import Link from "next/link";
import { Package, ShoppingBag, Image, BarChart3, LogOut, Scale, Tag, Ticket, Star, Menu, X } from "lucide-react";

const NAV = [
  { href: "/admin/orders", label: "Orders", Icon: ShoppingBag },
  { href: "/admin/products", label: "Products", Icon: Package },
  { href: "/admin/categories", label: "Categories", Icon: Tag },
  { href: "/admin/inventory", label: "Inventory", Icon: BarChart3 },
  { href: "/admin/coupons", label: "Coupons", Icon: Ticket },
  { href: "/admin/reviews", label: "Reviews", Icon: Star },
  { href: "/admin/content", label: "Content", Icon: Image },
  { href: "/admin/reconciliation", label: "Reconciliation", Icon: Scale },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  // The session lives in memory and is restored from the refresh cookie after
  // mount. Without waiting for that, `isAuthenticated` is false for the first
  // moment of every page load, and this effect bounced a perfectly valid admin
  // to /login on any refresh ordirect visit to an /admin URL.
  const sessionChecked = useAuthStore((s) => s.sessionChecked);
  // The sidebar is permanent from lg up and a drawer below it. Fixed at
  // w-56 it took 56% of a 390px phone, leaving the New Product form about
  // 60px of usable width - every label wrapped to two words and the inputs
  // were unusable.
  const [navOpen, setNavOpen] = useState(false);

  useEffect(() => {
    if (!sessionChecked) return;
    if (!isAuthenticated) { router.push("/login"); return; }
    if (user?.role !== "admin" && user?.role !== "operations" && user?.role !== "finance") {
      router.push("/");
    }
  }, [sessionChecked, isAuthenticated, user, router]);

  if (!sessionChecked) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading…</p>
      </div>
    );
  }
  if (!isAuthenticated) return null;

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Tapping away closes the drawer; absent below lg where it does not exist. */}
      {navOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar: a drawer on a phone, a permanent column from lg up. */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-56 bg-white border-r border-gray-200 flex flex-col transition-transform lg:static lg:z-auto lg:translate-x-0 ${
          navOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="px-4 py-5 border-b border-gray-100">
          <div className="flex items-start justify-between">
            <div>
              <span className="font-serif font-bold text-xl text-[#5C3317]">ZISUN</span>
              <span className="block text-xs text-muted mt-0.5">Admin Panel</span>
            </div>
            <button
              onClick={() => setNavOpen(false)}
              aria-label="Close menu"
              className="lg:hidden -mr-1 p-1 text-gray-500 hover:text-gray-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ href, label, Icon }) => (
            <Link key={href} href={href} onClick={() => setNavOpen(false)} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors">
              <Icon className="w-4 h-4 text-gray-500" />
              {label}
            </Link>
          ))}
        </nav>
        <div className="p-3 border-t border-gray-100">
          <button
            onClick={() => { useAuthStore.getState().clearAuth(); router.push("/login"); }}
            className="flex items-center gap-3 px-3 py-2.5 w-full rounded-lg text-sm text-red-600 hover:bg-red-50"
          >
            <LogOut className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>
      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden flex items-center gap-3 px-4 py-3 bg-white border-b border-gray-200">
          <button
            onClick={() => setNavOpen(true)}
            aria-label="Open menu"
            className="p-1 -ml-1 text-gray-700"
          >
            <Menu className="w-5 h-5" />
          </button>
          <span className="font-serif font-bold text-[#5C3317]">ZISUN</span>
          <span className="text-xs text-muted">Admin</span>
        </header>
        <main className="flex-1 overflow-y-auto min-w-0">{children}</main>
      </div>
    </div>
  );
}
