"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { User, MapPin, ShoppingBag, LogOut, ChevronRight, Plus, Trash2, Star } from "lucide-react";
import { useAuthStore } from "@/store/useAuthStore";
import { useAddresses, useCreateAddress, useSetDefaultAddress, useDeleteAddress, AddressCreate } from "@/lib/queries/address";
import { useToast } from "@/components/ui/ToastProvider";
import { api } from "@/lib/api";

const INDIAN_STATES = [
  "Andhra Pradesh","Arunachal Pradesh","Assam","Bihar","Chhattisgarh","Goa","Gujarat","Haryana",
  "Himachal Pradesh","Jharkhand","Karnataka","Kerala","Madhya Pradesh","Maharashtra","Manipur",
  "Meghalaya","Mizoram","Nagaland","Odisha","Punjab","Rajasthan","Sikkim","Tamil Nadu","Telangana",
  "Tripura","Uttar Pradesh","Uttarakhand","West Bengal",
  "Andaman and Nicobar Islands","Chandigarh","Dadra and Nagar Haveli and Daman and Diu",
  "Delhi","Jammu and Kashmir","Ladakh","Lakshadweep","Puducherry",
];

function AddressForm({ onDone }: { onDone: () => void }) {
  const { showToast } = useToast();
  const createAddress = useCreateAddress();
  const [form, setForm] = useState<AddressCreate>({ line1: "", city: "", state: "", pincode: "" });
  const [errors, setErrors] = useState<Partial<Record<keyof AddressCreate, string>>>({});

  function validate(): boolean {
    const e: typeof errors = {};
    if (!form.line1.trim()) e.line1 = "Required";
    if (!form.city.trim()) e.city = "Required";
    if (!INDIAN_STATES.includes(form.state)) e.state = "Select a valid state";
    if (!/^\d{6}$/.test(form.pincode)) e.pincode = "Must be 6 digits";
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate()) return;
    createAddress.mutate(form, {
      onSuccess: () => { showToast("Address saved", "success"); onDone(); },
      onError: () => showToast("Failed to save address", "error"),
    });
  }

  function field(label: string, key: keyof AddressCreate, props: React.InputHTMLAttributes<HTMLInputElement> = {}) {
    return (
      <div>
        <label className="text-xs font-semibold text-muted block mb-1">{label}</label>
        <input
          {...props}
          value={form[key] ?? ""}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 text-sm text-foreground outline-none focus:border-primary transition-colors bg-white"
        />
        {errors[key] && <p className="text-red-500 text-xs mt-0.5">{errors[key]}</p>}
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {field("Address Line 1", "line1", { placeholder: "House no., Street, Area" })}
      {field("City", "city", { placeholder: "City" })}
      <div>
        <label className="text-xs font-semibold text-muted block mb-1">State</label>
        <select
          value={form.state}
          onChange={(e) => setForm((f) => ({ ...f, state: e.target.value }))}
          className="w-full px-4 py-3 rounded-2xl border-2 border-gray-200 text-sm text-foreground outline-none focus:border-primary transition-colors bg-white"
        >
          <option value="">Select State</option>
          {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        {errors.state && <p className="text-red-500 text-xs mt-0.5">{errors.state}</p>}
      </div>
      {field("Pincode", "pincode", { placeholder: "6-digit pincode", maxLength: 6, inputMode: "numeric" })}
      <div className="flex gap-3 pt-1">
        <button type="button" onClick={onDone} className="flex-1 py-3 rounded-full border-2 border-gray-200 text-sm font-semibold text-foreground">
          Cancel
        </button>
        <button
          type="submit"
          disabled={createAddress.isPending}
          className="flex-1 py-3 rounded-full bg-primary text-white text-sm font-semibold disabled:opacity-50"
        >
          {createAddress.isPending ? "Saving…" : "Save Address"}
        </button>
      </div>
    </form>
  );
}

export default function ProfilePage() {
  const router = useRouter();
  const { showToast } = useToast();
  const { user, clearAuth, sessionChecked } = useAuthStore();
  const { data: addresses, isLoading: loadingAddresses } = useAddresses();
  const setDefault = useSetDefaultAddress();
  const deleteAddress = useDeleteAddress();
  const [showAddForm, setShowAddForm] = useState(false);

  const maskedPhone = user?.phone
    ? user.phone.slice(0, 5) + "****" + user.phone.slice(-4)
    : "";

  async function handleLogout() {
    try { await api.post("/auth/logout"); } catch {}
    clearAuth();
    router.replace("/login");
    showToast("Logged out", "info");
  }

  // Before the session restore finishes, "no user" means "not asked yet".
  // Rendering the signed-out screen here shows a sign-in wall to someone who
  // is already signed in — the bug this change exists to remove.
  if (!sessionChecked) return null;
  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center h-full px-6 gap-4">
        <User className="w-12 h-12 text-gray-200" />
        <p className="text-foreground font-semibold text-base text-center">Sign in to view your profile</p>
        <button onClick={() => router.push("/login")} className="bg-primary text-white px-8 py-3 rounded-full font-semibold text-sm">
          Sign in
        </button>
      </div>
    );
  }

  return (
    <div className="w-full bg-background">
      <div className="pb-6">
        {/* Profile header */}
        <div className="px-5 pt-14 pb-6 flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
            <User className="w-7 h-7 text-primary" />
          </div>
          <div>
            <p className="font-serif text-xl font-bold text-foreground">{user.name ?? "ZISUN User"}</p>
            <p className="text-muted text-sm">{maskedPhone}</p>
          </div>
        </div>

        {/* Quick links */}
        <div className="px-5 space-y-2 mb-6">
          <button
            onClick={() => router.push("/orders")}
            className="w-full flex items-center justify-between bg-white rounded-2xl px-4 py-4 shadow-sm border border-gray-50"
          >
            <div className="flex items-center gap-3">
              <ShoppingBag className="w-5 h-5 text-primary" />
              <span className="text-foreground font-semibold text-sm">My Orders</span>
            </div>
            <ChevronRight className="w-4 h-4 text-muted" />
          </button>
          <button
            onClick={() => router.push("/wishlist")}
            className="w-full flex items-center justify-between bg-white rounded-2xl px-4 py-4 shadow-sm border border-gray-50"
          >
            <div className="flex items-center gap-3">
              <Star className="w-5 h-5 text-primary" />
              <span className="text-foreground font-semibold text-sm">Wishlist</span>
            </div>
            <ChevronRight className="w-4 h-4 text-muted" />
          </button>
        </div>

        {/* Addresses */}
        <div className="px-5 mb-6">
          <div className="flex justify-between items-center mb-3">
            <div className="flex items-center gap-2">
              <MapPin className="w-4 h-4 text-primary" />
              <h2 className="font-serif text-lg font-bold text-foreground">Saved Addresses</h2>
            </div>
            {!showAddForm && (
              <button
                onClick={() => setShowAddForm(true)}
                className="flex items-center gap-1 text-primary text-sm font-semibold"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            )}
          </div>

          {showAddForm && (
            <div className="bg-white rounded-2xl p-4 mb-3 shadow-sm border border-gray-50">
              <AddressForm onDone={() => setShowAddForm(false)} />
            </div>
          )}

          {loadingAddresses ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-20 bg-white rounded-2xl animate-pulse" />
              ))}
            </div>
          ) : addresses?.length === 0 ? (
            <p className="text-muted text-sm text-center py-4">No saved addresses</p>
          ) : (
            <div className="space-y-2">
              {addresses?.map((addr) => (
                <div
                  key={addr.id}
                  className={`bg-white rounded-2xl px-4 py-3 shadow-sm border ${addr.is_default ? "border-primary" : "border-gray-50"}`}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      {addr.is_default && (
                        <span className="text-primary text-[10px] font-bold uppercase tracking-wider">Default</span>
                      )}
                      <p className="text-foreground text-sm font-semibold leading-snug">{addr.line1}</p>
                      <p className="text-muted text-xs">{addr.city}, {addr.state} — {addr.pincode}</p>
                    </div>
                    <div className="flex gap-1 ml-2">
                      {!addr.is_default && (
                        <button
                          onClick={() => setDefault.mutate(addr.id)}
                          className="text-xs text-primary font-semibold px-2 py-1 rounded-lg border border-primary/20"
                        >
                          Set default
                        </button>
                      )}
                      <button
                        onClick={() => deleteAddress.mutate(addr.id)}
                        className="w-7 h-7 flex items-center justify-center rounded-full text-gray-400 hover:text-red-500"
                        aria-label="Delete address"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Logout */}
        <div className="px-5">
          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 py-3.5 rounded-full border-2 border-red-100 text-red-500 font-semibold text-sm"
          >
            <LogOut className="w-4 h-4" /> Log Out
          </button>
        </div>
      </div>
    </div>
  );
}
