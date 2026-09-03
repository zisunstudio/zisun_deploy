import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/legal/LegalPage";
import { COMPANY, POLICY_TERMS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Exchange & Cancellation Policy | ZISUN",
  description:
    "ZISUN does not offer returns. Size exchanges within 3 days of delivery, with video proof. Cancellations before dispatch.",
};

/**
 * The route stays /refund even though the policy is now an exchange policy.
 * Razorpay's merchant record points at this URL, the footer and product page
 * link to it, and a policy that 404s for a week while links are chased is worse
 * than one with an unfashionable path.
 */
export default function RefundPage() {
  return (
    <LegalPage title="Exchange & Cancellation">
      <p>
        Please read this before you order. {COMPANY.legalName} does{" "}
        <strong>not offer returns or change-of-mind refunds</strong>. We offer one
        thing: an exchange if the size does not fit, raised within{" "}
        <strong>{POLICY_TERMS.exchangeWindowDays} days of delivery</strong>. Everything
        below explains exactly how that works and what it does not cover.
      </p>

      <Section heading="1. Cancelling an order">
        <p>
          You can cancel free of charge any time <strong>before dispatch</strong> —
          email {COMPANY.email} or message us on WhatsApp with your order number.
          Prepaid orders are refunded in full, with no cancellation charge.
        </p>
        <p>
          Once an order has been handed to the courier it can no longer be cancelled.
        </p>
      </Section>

      <Section heading="2. No returns">
        <p>
          We do not accept returns and do not offer refunds for change of mind, for a
          piece you decided you did not like, or for any reason other than the size
          exchange described in section 3 and the statutory case in section 5.
        </p>
        <p>
          We would rather say this plainly here than have you discover it after
          delivery. Please use the size guide on every product page before ordering —
          it lists body measurements in centimetres for each size, and our fit notes
          tell you which way to go if you fall between two.
        </p>
      </Section>

      <Section heading="3. Size exchange">
        <p>
          If the size does not fit, we will exchange it for a different size of the
          same piece, subject to that size being in stock.
        </p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            Raise the request within{" "}
            <strong>{POLICY_TERMS.exchangeWindowDays} days of delivery</strong>. After
            that we cannot help.
          </li>
          <li>
            <strong>Size is the only accepted reason.</strong> Not colour, not fabric
            feel, not a change of mind.
          </li>
          <li>
            The piece must be unworn and unwashed, with original tags attached, free of
            stains, perfume, marks or damage, and in its original packaging.
          </li>
          <li>
            One exchange per order line. An exchanged piece cannot itself be exchanged
            again.
          </li>
          <li>
            If your size is out of stock we will tell you, and issue a refund for that
            piece instead.
          </li>
        </ul>
      </Section>

      <Section heading="4. Video proof is required">
        <p>
          To raise an exchange you must send us a video that shows the sealed parcel
          being opened and the piece being removed. This is how we tell a genuine size
          problem from a worn garment, and it is the reason we can offer an exchange at
          all at these prices.
        </p>
        <p>The video must be:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>One continuous shot</strong>, from the sealed parcel to the piece in
            your hands. Do not stop and restart the recording.
          </li>
          <li>
            <strong>Unedited.</strong> No cuts, no trimming, no speed changes, no
            filters.
          </li>
          <li>
            Clear enough to see the shipping label, the parcel seal and the tags on the
            piece.
          </li>
        </ul>
        <p>
          <strong>Please start recording before you open the parcel.</strong> A video
          that begins after the parcel is already open cannot be accepted, and there is
          no way to go back and record it — so if there is any chance you will want an
          exchange, film the opening.
        </p>
        <p>
          We may decline an exchange where the video is edited, discontinuous, or does
          not show the parcel being opened.
        </p>
      </Section>

      <Section heading="5. Damaged, defective or wrong item">
        <p>
          Separately from the size exchange above, if a piece arrives damaged, faulty,
          or is not the item you ordered, contact us within{" "}
          <strong>48 hours of delivery</strong> with your order number, photographs and
          the unboxing video. We will arrange a free replacement or a full refund
          including shipping. Please keep the packaging until it is resolved.
        </p>
        <p>
          This is your right under the Consumer Protection (E-Commerce) Rules 2020 and
          it is not affected by anything else in this policy.
        </p>
      </Section>

      <Section heading="6. Colour and handloom character">
        <p>
          <strong>
            Colour will vary slightly from the photographs due to lighting, your screen
            and the dye lot.
          </strong>{" "}
          Handwoven and hand-finished cotton also shows small irregularities in the
          weave. These are characteristics of natural material and hand production, not
          defects, and they are <strong>not grounds for an exchange</strong>.
        </p>
        <p>
          Every product photograph on this site is labelled where it is representative
          rather than a photograph of the exact piece you will receive.
        </p>
      </Section>

      <Section heading="7. How an exchange works">
        <ol className="list-decimal list-inside space-y-1">
          <li>
            Within {POLICY_TERMS.exchangeWindowDays} days of delivery, WhatsApp or email
            us your order number, the size you need, and the unboxing video.
          </li>
          <li>We confirm the exchange and that your size is in stock.</li>
          <li>
            <strong>We arrange the reverse pickup.</strong> You do not need to book a
            courier or pay for one — keep the piece in its original packaging and hand
            it to our courier.
          </li>
          <li>
            Once we receive and inspect the piece, we dispatch the replacement size.
          </li>
        </ol>
        <p>
          We do not charge you for the pickup or the re-delivery on a size exchange.
        </p>
      </Section>

      <Section heading="8. Refunds, where they apply">
        <ul className="list-disc list-inside space-y-1">
          <li>
            Refunds arise only from a cancellation before dispatch, an out-of-stock
            exchange size, or the damaged/defective/wrong-item case in section 5.
          </li>
          <li>
            They are issued within{" "}
            <strong>{POLICY_TERMS.refundProcessingDays}</strong> of approval.
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

      <Section heading="9. Refused or undelivered orders">
        <p>
          If a Cash on Delivery order is refused at the door or repeatedly
          undeliverable, we may decline future COD orders for that account. For prepaid
          orders returned undelivered, we refund the order value; shipping costs already
          incurred may be deducted.
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
          {COMPANY.gstin ? (
            <>
              <br />
              GSTIN: {COMPANY.gstin}
            </>
          ) : null}
          <br />
          {COMPANY.supportHours}
        </p>
      </Section>
    </LegalPage>
  );
}
