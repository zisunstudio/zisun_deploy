import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/legal/LegalPage";
import { COMPANY, POLICY_TERMS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Shipping Policy | ZISUN",
  description: "Dispatch times, delivery estimates and shipping charges at ZISUN.",
};

export default function ShippingPage() {
  return (
    <LegalPage title="Shipping Policy">
      <p>
        We ship across India through Shiprocket and its delivery partners. Here is what
        to expect.
      </p>

      <Section heading="1. Dispatch time">
        <p>
          Orders are packed and handed to the courier within{" "}
          <strong>{POLICY_TERMS.dispatchTimeframe}</strong> of confirmation. Orders
          placed on Sundays or public holidays are processed the next working day.
        </p>
      </Section>

      <Section heading="2. Delivery time">
        <p>
          Typical delivery is <strong>{POLICY_TERMS.deliveryTimeframe}</strong> from
          dispatch. Metro cities are usually at the faster end; remote pincodes, the
          North-East, and Jammu &amp; Kashmir can take longer.
        </p>
        <p>
          These are estimates, not guarantees — once a parcel is with the courier,
          timing depends on their network.
        </p>
      </Section>

      <Section heading="3. Shipping charges">
        <p>
          Shipping charges, if any, are shown at checkout before you pay. Any Cash on
          Delivery handling fee is also displayed there.
        </p>
      </Section>

      <Section heading="4. Serviceability">
        <p>
          We deliver to pincodes covered by our courier partners. If your pincode is not
          serviceable, checkout will tell you. Cash on Delivery is available on eligible
          pincodes and order values only.
        </p>
      </Section>

      <Section heading="5. Tracking">
        <p>
          You will receive a tracking link over WhatsApp or SMS once your order ships,
          and you can see order status any time under{" "}
          <Link href="/orders" className="text-primary underline">
            My Orders
          </Link>
          .
        </p>
      </Section>

      <Section heading="6. Delivery attempts and failed deliveries">
        <p>
          Couriers normally attempt delivery up to three times. Please keep your phone
          reachable — most failed deliveries happen because the courier could not reach
          the customer.
        </p>
        <p>
          If a parcel returns to us undelivered, we will contact you to arrange
          re-dispatch (shipping may be chargeable) or a refund per our{" "}
          <Link href="/refund" className="text-primary underline">
            Refund &amp; Cancellation Policy
          </Link>
          .
        </p>
      </Section>

      <Section heading="7. Incorrect addresses">
        <p>
          Please double-check your address and phone number before paying. If you spot a
          mistake, contact us immediately — we can usually correct it before dispatch,
          but not after.
        </p>
      </Section>

      <Section heading="8. International shipping">
        <p>
          We currently ship within India only. If you are outside India and would like
          to order, email us — we may be able to arrange it.
        </p>
      </Section>

      <Section heading="9. Contact">
        <p>
          {COMPANY.legalName}
          {COMPANY.address ? (
            <>
              <br />
              {COMPANY.address}
            </>
          ) : null}
          <br />
          Email: {COMPANY.email}
          {COMPANY.phone ? (
            <>
              <br />
              Phone: {COMPANY.phone}
            </>
          ) : null}
          <br />
          {COMPANY.supportHours}
        </p>
      </Section>
    </LegalPage>
  );
}
