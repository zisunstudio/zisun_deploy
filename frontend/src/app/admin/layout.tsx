"use client";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/store/useAuthStore";
import { useEffect } from "react";
import Link from "next/link";
import { Package, ShoppingBag, Image, BarChart3, LogOut, Scale, Tag, Ticket, Star } from "lucide-react";

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
      {/* Sidebar */}
      <aside className="w-56 bg-white border-r border-gray-200 flex flex-col">
        <div className="px-4 py-5 border-b border-gray-100">
          <span className="font-serif font-bold text-xl text-[#5C3317]">ZISUN</span>
          <span className="block text-xs text-muted mt-0.5">Admin Panel</span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV.map(({ href, label, Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-700 hover:bg-gray-100 transition-colors">
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
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
