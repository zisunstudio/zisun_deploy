import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/legal/LegalPage";
import { COMPANY, POLICY_TERMS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Refund & Cancellation Policy | ZISUN",
  description: "Cancellations, returns, exchanges and refunds at ZISUN.",
};

export default function RefundPage() {
  return (
    <LegalPage title="Refund & Cancellation">
      <p>
        We want you to keep only what you love. This policy explains how to cancel,
        return or exchange an order with {COMPANY.legalName}.
      </p>

      <Section heading="1. Cancelling an order">
        <p>
          You can cancel free of charge any time <strong>before dispatch</strong> — email{" "}
          {COMPANY.email} or message us on WhatsApp with your order number. Prepaid
          orders are refunded in full.
        </p>
        <p>
          Once an order has been handed to the courier it can no longer be cancelled;
          please use the return process below.
        </p>
      </Section>

      <Section heading="2. Return window">
        <p>
          Return requests are accepted within{" "}
          <strong>{POLICY_TERMS.returnWindowDays} days of delivery</strong>.
        </p>
        <p>Items must be:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>unworn and unwashed, with original tags attached</li>
          <li>free of stains, perfume or damage</li>
          <li>in their original packaging where possible</li>
        </ul>
      </Section>

      <Section heading="3. Exchanges (fastest option for fit)">
        <p>
          If the size isn&rsquo;t right, we recommend an exchange rather than a return —
          it&rsquo;s quicker and you keep the piece. Subject to stock in the size you
          want. Contact us within the same {POLICY_TERMS.returnWindowDays}-day window.
        </p>
      </Section>

      <Section heading="4. What cannot be returned">
        <ul className="list-disc list-inside space-y-1">
          <li>Items marked <strong>final sale</strong> or clearance</li>
          <li>Items that have been worn, washed, altered or damaged after delivery</li>
          <li>Items returned after the {POLICY_TERMS.returnWindowDays}-day window</li>
        </ul>
        <p>
          Slight colour variation and small irregularities in handwoven fabric are
          characteristics of natural material and are not treated as defects — though if
          you are unhappy, talk to us.
        </p>
      </Section>

      <Section heading="5. Damaged, defective or wrong item">
        <p>
          If something arrives damaged, faulty or not what you ordered, contact us within{" "}
          <strong>48 hours of delivery</strong> with photographs and your order number.
          We will arrange a free replacement or a full refund including shipping. Please
          keep the packaging until the issue is resolved.
        </p>
        <p>
          An unboxing photo or video genuinely helps us resolve these quickly.
        </p>
      </Section>

      <Section heading="6. How to start a return">
        <ol className="list-decimal list-inside space-y-1">
          <li>Email {COMPANY.email} or WhatsApp us with your order number and reason</li>
          <li>We confirm eligibility and arrange a reverse pickup where available</li>
          <li>Where pickup is unavailable, we will share a return address</li>
          <li>Once received and inspected, we process your refund</li>
        </ol>
      </Section>

      <Section heading="7. Refunds">
        <ul className="list-disc list-inside space-y-1">
          <li>
            Refunds are issued within <strong>{POLICY_TERMS.refundProcessingDays}</strong> of
            us receiving and approving the returned item.
          </li>
          <li>
            <strong>Prepaid orders</strong> are refunded to the original payment method
            via Razorpay. Your bank may take a few additional days to display it.
          </li>
          <li>
            <strong>Cash on Delivery orders</strong> are refunded by bank transfer or
            UPI — we will ask for those details.
          </li>
          <li>
            Any coupon discount applied is refunded proportionally; the coupon itself is
            not reissued.
          </li>
        </ul>
      </Section>

      <Section heading="8. Return shipping costs">
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Our error</strong> (damaged, defective, wrong item): we pay return
            shipping and refund your original shipping.
          </li>
          <li>
            <strong>Change of mind or fit:</strong> a return shipping charge may be
            deducted from your refund. We will tell you the amount before you send
            anything back.
          </li>
        </ul>
      </Section>

      <Section heading="9. Refused or undelivered orders">
        <p>
          If a Cash on Delivery order is refused at the door or repeatedly undeliverable,
          we may decline future COD orders for that account. For prepaid orders returned
          undelivered, we refund the order value; shipping costs already incurred may be
          deducted.
        </p>
      </Section>

      <Section heading="10. Contact">
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
