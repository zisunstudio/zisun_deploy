"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import {
  ChevronLeft,
  CheckCircle,
  MapPin,
  CreditCard,
  ShoppingBag,
} from "lucide-react";
import Image from "next/image";
import { useCart, useInitiateCheckout, useVerifyPayment } from "@/lib/queries/cart";
import { useAddresses, useCreateAddress } from "@/lib/queries/address";
import { useAuthStore } from "@/store/useAuthStore";
import { useToast } from "@/components/ui/ToastProvider";
import { formatPrice } from "@/lib/queries/catalog";
import { trackEvent } from "@/lib/queries/analytics";

// Declare Razorpay on window to avoid TypeScript errors
declare global {
  interface Window {
    Razorpay: any;
  }
}

type Step = "cart" | "address" | "payment" | "confirmation";

const INDIAN_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Chandigarh",
  "Puducherry",
];

const STEPS: { key: Step; label: string }[] = [
  { key: "cart", label: "Cart" },
  { key: "address", label: "Address" },
  { key: "payment", label: "Payment" },
  { key: "confirmation", label: "Done" },
];

export default function CheckoutPage() {
  const router = useRouter();
  const { showToast } = useToast();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated());
  const user = useAuthStore((s) => s.user);

  const { data: cart, isLoading: cartLoading } = useCart();
  const { data: addresses } = useAddresses();
  const initiateCheckout = useInitiateCheckout();
  const verifyPayment = useVerifyPayment();
  const createAddress = useCreateAddress();

  const [step, setStep] = useState<Step>("cart");
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(
    null
  );
  const [confirmedOrderId, setConfirmedOrderId] = useState<string | null>(null);
  const [showAddressForm, setShowAddressForm] = useState(false);
  const [newAddress, setNewAddress] = useState({
    line1: "",
    city: "",
    state: "",
    pincode: "",
  });

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/login");
    }
  }, [isAuthenticated, router]);

  useEffect(() => {
    if (addresses?.length) {
      const def = addresses.find((a) => a.is_default);
      setSelectedAddressId(def?.id ?? addresses[0].id);
    }
  }, [addresses]);

  if (!isAuthenticated) return null;

  if (cartLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin w-8 h-8 border-2 border-primary rounded-full border-t-transparent" />
      </div>
    );
  }

  if (!cart || cart.items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
        <ShoppingBag className="w-16 h-16 text-muted" />
        <p className="text-muted">Your cart is empty</p>
        <button
          onClick={() => router.push("/shop")}
          className="bg-primary text-white px-6 py-3 rounded-full font-semibold"
        >
          Shop Now
        </button>
      </div>
    );
  }

  async function handlePayment() {
    if (!selectedAddressId) {
      showToast("Please select an address", "warning");
      return;
    }

    try {
      const res = await initiateCheckout.mutateAsync(selectedAddressId);
      const { order_id, razorpay_order_id, amount } = res.data;

      const RAZORPAY_KEY = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID;

      // Load Razorpay script if not already loaded
      if (!window.Razorpay) {
        await new Promise<void>((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "https://checkout.razorpay.com/v1/checkout.js";
          script.onload = () => resolve();
          script.onerror = () =>
            reject(new Error("Razorpay script failed to load"));
          document.body.appendChild(script);
        });
      }

      // Dev mode: skip Razorpay modal when key is missing or order is mock
      if (!RAZORPAY_KEY || razorpay_order_id.startsWith("mock_order_")) {
        showToast("Dev mode: payment simulated", "success");
        setConfirmedOrderId(order_id);
        setStep("confirmation");
        return;
      }

      const rzp = new window.Razorpay({
        key: RAZORPAY_KEY,
        amount,
        currency: "INR",
        order_id: razorpay_order_id,
        prefill: { contact: user?.phone },
        theme: { color: "#5C3317" },
        handler: async (response: {
          razorpay_payment_id: string;
          razorpay_order_id: string;
          razorpay_signature: string;
        }) => {
          try {
            const verifyRes = await verifyPayment.mutateAsync({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_signature: response.razorpay_signature,
            });
            setConfirmedOrderId(verifyRes.data.order_id);
            setStep("confirmation");
            showToast("Payment successful!", "success");
          } catch {
            showToast(
              "Payment verification failed. Please contact support with your payment ID: " +
                response.razorpay_payment_id,
              "error"
            );
          }
        },
        modal: {
          ondismiss: () => showToast("Payment cancelled", "warning"),
        },
      });
      rzp.open();
    } catch (err: any) {
      showToast(
        err?.response?.data?.error?.message ?? "Checkout failed",
        "error"
      );
    }
  }

  async function handleAddAddress() {
    try {
      const addr = await createAddress.mutateAsync({
        line1: newAddress.line1,
        city: newAddress.city,
        state: newAddress.state,
        pincode: newAddress.pincode,
      });
      setSelectedAddressId(addr.id);
      setShowAddressForm(false);
      setNewAddress({ line1: "", city: "", state: "", pincode: "" });
      showToast("Address added", "success");
    } catch {
      showToast("Failed to add address", "error");
    }
  }

  const stepIdx = STEPS.findIndex((s) => s.key === step);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center px-5 pt-12 pb-4 border-b border-gray-100">
        {step !== "confirmation" && (
          <button onClick={() => router.back()} className="mr-3">
            <ChevronLeft className="w-5 h-5 text-foreground" />
          </button>
        )}
        <h1 className="font-serif text-lg font-bold text-foreground">
          Checkout
        </h1>
      </div>

      {/* Step progress bar */}
      <div className="flex px-5 pt-3 pb-2 gap-1">
        {STEPS.map((s, i) => (
          <div
            key={s.key}
            className={`flex-1 h-1 rounded-full transition-all ${
              i <= stepIdx ? "bg-primary" : "bg-gray-200"
            }`}
          />
        ))}
      </div>

      <div className="flex-1 overflow-y-auto no-scrollbar px-5 pb-4">
        {/* Step 1: Cart Review */}
        {step === "cart" && (
          <div className="pt-4">
            <h2 className="font-semibold text-foreground mb-3">Your Items</h2>
            <div className="space-y-3">
              {cart.items.map((item) => (
                <div
                  key={item.id}
                  className="flex gap-3 bg-white rounded-xl p-3 shadow-sm"
                >
                  {item.image_url && (
                    <div className="relative w-16 h-16 rounded-lg flex-shrink-0 overflow-hidden">
                      <Image
                        src={item.image_url}
                        alt={item.product_name ?? "Product"}
                        fill
                        className="object-cover"
                      />
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm text-foreground truncate">
                      {item.product_name ?? "Item"}
                    </p>
                    {item.size && (
                      <p className="text-xs text-muted">Size: {item.size}</p>
                    )}
                    {item.color && (
                      <p className="text-xs text-muted">
                        Colour: {item.color}
                      </p>
                    )}
                    <p className="text-sm font-bold text-primary mt-1">
                      {formatPrice(item.unit_price)} &times; {item.quantity}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex justify-between font-bold text-foreground border-t border-gray-100 pt-3">
              <span>Subtotal</span>
              <span>{formatPrice(cart.cart_total)}</span>
            </div>
          </div>
        )}

        {/* Step 2: Address Selection */}
        {step === "address" && (
          <div className="pt-4">
            <h2 className="font-semibold text-foreground mb-3">
              Delivery Address
            </h2>
            <div className="space-y-2">
              {(addresses ?? []).map((addr) => (
                <div
                  key={addr.id}
                  onClick={() => setSelectedAddressId(addr.id)}
                  className={`p-4 rounded-xl border-2 cursor-pointer transition-colors ${
                    selectedAddressId === addr.id
                      ? "border-primary bg-primary/5"
                      : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start gap-2">
                    <MapPin className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-foreground">
                        {addr.line1}
                      </p>
                      {addr.line2 && (
                        <p className="text-xs text-muted">{addr.line2}</p>
                      )}
                      <p className="text-xs text-muted">
                        {addr.city}, {addr.state} &mdash; {addr.pincode}
                      </p>
                      {addr.is_default && (
                        <span className="text-xs text-primary font-semibold">
                          Default
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {!showAddressForm ? (
              <button
                onClick={() => setShowAddressForm(true)}
                className="mt-3 text-primary text-sm font-semibold"
              >
                + Add new address
              </button>
            ) : (
              <div className="mt-3 space-y-2 p-4 bg-gray-50 rounded-xl">
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Address Line 1"
                  value={newAddress.line1}
                  onChange={(e) =>
                    setNewAddress({ ...newAddress, line1: e.target.value })
                  }
                />
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="City"
                  value={newAddress.city}
                  onChange={(e) =>
                    setNewAddress({ ...newAddress, city: e.target.value })
                  }
                />
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30"
                  value={newAddress.state}
                  onChange={(e) =>
                    setNewAddress({ ...newAddress, state: e.target.value })
                  }
                >
                  <option value="">Select State</option>
                  {INDIAN_STATES.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                  placeholder="Pincode"
                  maxLength={6}
                  inputMode="numeric"
                  value={newAddress.pincode}
                  onChange={(e) =>
                    setNewAddress({ ...newAddress, pincode: e.target.value })
                  }
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleAddAddress}
                    disabled={createAddress.isPending}
                    className="flex-1 bg-primary text-white py-2 rounded-lg text-sm font-semibold disabled:opacity-50"
                  >
                    {createAddress.isPending ? "Saving..." : "Save"}
                  </button>
                  <button
                    onClick={() => {
                      setShowAddressForm(false);
                      setNewAddress({
                        line1: "",
                        city: "",
                        state: "",
                        pincode: "",
                      });
                    }}
                    className="flex-1 border py-2 rounded-lg text-sm"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Step 3: Payment / Order Summary */}
        {step === "payment" && (
          <div className="pt-4">
            <h2 className="font-semibold text-foreground mb-3">
              Order Summary
            </h2>
            <div className="bg-white rounded-xl p-4 shadow-sm space-y-2">
              {cart.items.map((item) => (
                <div key={item.id} className="flex justify-between text-sm">
                  <span className="text-foreground truncate max-w-[60%]">
                    {item.product_name ?? "Item"} &times; {item.quantity}
                  </span>
                  <span className="font-medium">
                    {formatPrice(item.unit_price * item.quantity)}
                  </span>
                </div>
              ))}
              <div className="border-t border-gray-100 pt-2 flex justify-between font-bold text-foreground">
                <span>Total</span>
                <span className="text-primary">
                  {formatPrice(cart.cart_total)}
                </span>
              </div>
            </div>
            {selectedAddressId && addresses && (
              <div className="mt-3 bg-gray-50 rounded-xl p-3 flex items-center gap-2">
                <MapPin className="w-4 h-4 text-primary flex-shrink-0" />
                <p className="text-sm text-muted">
                  Delivering to:{" "}
                  <span className="font-medium text-foreground">
                    {addresses.find((a) => a.id === selectedAddressId)?.city}
                  </span>
                </p>
              </div>
            )}
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === "confirmation" && confirmedOrderId && (
          <div className="pt-8 flex flex-col items-center text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mb-4" />
            <h2 className="font-serif text-2xl font-bold text-foreground mb-2">
              Order Placed!
            </h2>
            <p className="text-muted text-sm mb-4">
              Order #{confirmedOrderId.slice(0, 8).toUpperCase()}
            </p>
            <div className="bg-green-50 border border-green-200 rounded-xl p-4 w-full mb-6">
              <p className="text-sm text-green-700">
                Check your WhatsApp for order confirmation
              </p>
            </div>
            <button
              onClick={() => router.push(`/orders/${confirmedOrderId}`)}
              className="w-full bg-primary text-white py-4 rounded-full font-semibold mb-3"
            >
              Track Order
            </button>
            <button
              onClick={() => router.push("/shop")}
              className="w-full border border-gray-200 py-4 rounded-full font-semibold text-foreground"
            >
              Continue Shopping
            </button>
          </div>
        )}
      </div>

      {/* Bottom CTA */}
      {step !== "confirmation" && (
        <div className="px-5 pb-8 pt-3 border-t border-gray-100 bg-background">
          {step === "cart" && (
            <button
              onClick={() => setStep("address")}
              className="w-full bg-primary text-white py-4 rounded-full font-semibold"
            >
              Proceed to Address
            </button>
          )}
          {step === "address" && (
            <button
              onClick={() => {
                if (!selectedAddressId) {
                  showToast("Please select an address", "warning");
                  return;
                }
                trackEvent("checkout_initiated", { cart_total: cart?.cart_total });
                setStep("payment");
              }}
              className="w-full bg-primary text-white py-4 rounded-full font-semibold"
            >
              Proceed to Payment
            </button>
          )}
          {step === "payment" && (
            <button
              onClick={handlePayment}
              disabled={initiateCheckout.isPending}
              className="w-full bg-primary text-white py-4 rounded-full font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <CreditCard className="w-5 h-5" />
              {initiateCheckout.isPending
                ? "Processing..."
                : `Pay ${formatPrice(cart.cart_total)}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
