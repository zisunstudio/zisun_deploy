import type { Metadata } from "next";
import { OrderTracking } from "./OrderTracking";

export const metadata: Metadata = {
  title: "Your order | ZISUN",
  // A parcel's status is not something search engines should hold.
  robots: { index: false, follow: false },
};

export default function OrderPage({ params }: { params: { id: string } }) {
  return <OrderTracking orderId={params.id} />;
}
