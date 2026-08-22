import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/legal/LegalPage";
import { COMPANY, POLICY_TERMS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms & Conditions | ZISUN",
  description: "The terms that apply when you shop with ZISUN.",
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms & Conditions">
      <p>
        These terms govern your use of {COMPANY.websiteUrl}, operated by{" "}
        {COMPANY.legalName}. By placing an order you accept them.
      </p>

      <Section heading="1. Account and eligibility">
        <p>
          You must be 18 or older to buy. You sign in with your mobile number and a
          one-time password; keep access to that number secure, as anyone who receives
          the OTP can access your account. Provide accurate details — most failed
          deliveries are caused by an incorrect address or phone number.
        </p>
      </Section>

      <Section heading="2. Products, colour and sizing">
        <p>
          We sell natural-fibre garments. Colour can vary slightly between screens and
          between dye lots, and handwoven or hand-finished fabric may show small
          irregularities. These are characteristics of the material, not defects.
        </p>
        <p>
          Please check the size guide before ordering. Fit issues are the most common
          reason for returns.
        </p>
      </Section>

      <Section heading="3. Prices and payment">
        <p>
          All prices are in Indian Rupees (INR) and inclusive of applicable taxes unless
          stated otherwise. Payments are processed by Razorpay; Cash on Delivery may be
          offered on eligible orders and pincodes.
        </p>
        <p>
          We take reasonable care with pricing, but if a product is listed at a
          materially incorrect price due to an error, we may cancel the order and refund
          you in full rather than fulfil it.
        </p>
      </Section>

      <Section heading="4. Order acceptance">
        <p>
          Your order is an offer to buy. A contract forms only when we confirm dispatch.
          We may decline or cancel an order — with a full refund — where stock is
          unavailable, the delivery address is not serviceable, payment fails
          verification, or we suspect fraud or resale abuse.
        </p>
      </Section>

      <Section heading="5. Shipping, returns and refunds">
        <p>
          Delivery timelines are set out in our{" "}
          <Link href="/shipping" className="text-primary underline">
            Shipping Policy
          </Link>
          . Returns and refunds — including the {POLICY_TERMS.returnWindowDays}-day
          window — are set out in our{" "}
          <Link href="/refund" className="text-primary underline">
            Refund &amp; Cancellation Policy
          </Link>
          . Both form part of these terms.
        </p>
      </Section>

      <Section heading="6. Coupons">
        <p>
          Discount codes are non-transferable, hold no cash value, may be limited per
          customer, and can be withdrawn at any time. We may cancel orders where a code
          has been obtained or used abusively.
        </p>
      </Section>

      <Section heading="7. Reviews and submitted content">
        <p>
          Reviews may only be submitted for items you have actually received, and are
          published after moderation. By posting, you grant us a non-exclusive right to
          display your review. We may remove content that is unlawful, abusive or
          misleading.
        </p>
      </Section>

      <Section heading="8. Intellectual property">
        <p>
          The {COMPANY.brandName} name, designs, photographs and site content belong to
          us and may not be reproduced for commercial use without written permission.
        </p>
      </Section>

      <Section heading="9. Liability">
        <p>
          Nothing here limits your rights under the Consumer Protection Act, 2019, or
          any liability that cannot lawfully be excluded. Subject to that, our total
          liability for any order is limited to the amount you paid for it. We are not
          liable for delays caused by events outside our reasonable control, including
          courier disruption, weather or strikes.
        </p>
      </Section>

      <Section heading="10. Governing law">
        <p>
          These terms are governed by the laws of India, and the courts at our
          registered location have jurisdiction. We would rather resolve any problem
          directly — please contact us first.
        </p>
      </Section>

      <Section heading="11. Contact">
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
        </p>
      </Section>
    </LegalPage>
  );
}
