import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/legal/LegalPage";
import { COMPANY, POLICY_TERMS, SITE_URL } from "@/lib/legal";
import { REFERRAL_TERMS as T } from "@/lib/referral";

export const metadata: Metadata = {
  title: "Sharing ZISUN | ZISUN",
  description: `How sharing ZISUN works: a friend takes ₹${T.friendOffRupees} off her first order, and we thank you with ₹${T.thankYouRupees} of store credit once her order is complete.`,
  alternates: { canonical: `${SITE_URL}/share` },
};

/**
 * The whole of the sharing arrangement, in the open.
 *
 * Written as a policy, in the same plain voice as the exchange page, because
 * that is what it is: the conditions under which ZISUN gives something away.
 * It is deliberately not a campaign page. There is no "earn", no counter, no
 * leaderboard and no urgency - a woman who tells a friend about a piece she
 * likes is thanked, and everything that could surprise her later is said
 * here first. docs/REFERRALS.md has the reasoning and the loophole register.
 */
export default function SharePage() {
  return (
    <LegalPage title="Sharing ZISUN">
      <p>
        ZISUN is small, and it grows when one woman tells another. If you tell a friend
        about a piece you liked, we would like to thank you. That is all this is, and
        this page says exactly how it works, including the parts where it does not.
      </p>

      <Section heading="1. How it works">
        <p>
          After your order is delivered, your order page and your account show a code
          that is yours. Share it with a friend however you like.
        </p>
        <p>
          Your friend takes <strong>₹{T.friendOffRupees} off her first ZISUN order</strong>{" "}
          of ₹{T.minOrderRupees} or more by entering the code at checkout. When her order
          is complete, <strong>₹{T.thankYouRupees} of store credit</strong> is added to
          your account, to use on any piece.
        </p>
      </Section>

      <Section heading="2. When the thank-you arrives">
        <p>
          Only when your friend&rsquo;s order is truly finished: delivered, and{" "}
          <strong>{T.holdDays} days past delivery</strong>. That is long enough for a size
          exchange to be raised ({POLICY_TERMS.exchangeRaiseWindowHours} hours), posted
          back ({POLICY_TERMS.exchangeReturnWindowDays} days) and received.
        </p>
        <p>
          If her order is cancelled, refused at the door, or comes back to us and is
          refunded, nothing is earned for it. If it comes back after the credit was
          added, the credit is withdrawn. A size exchange does not change anything:
          the sale stands, and so does the thank-you.
        </p>
      </Section>

      <Section heading="3. What a code is for">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>A friend&rsquo;s <strong>first</strong> order, going to a household that has not ordered from ZISUN before.</li>
          <li>Not your own order, and not an order going to your own address.</li>
          <li>One code on an order. A sharing code cannot be combined with another code.</li>
          <li>Orders placed on zisun.in. Marketplace orders do not carry codes.</li>
        </ul>
      </Section>

      <Section heading="4. Store credit">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>It is credit towards ZISUN pieces. It cannot be paid out as money or passed to someone else.</li>
          <li>It does not expire.</li>
          <li>You need to be signed in to use it, so nobody else can spend it with your phone number.</li>
          <li>It can cover a piece up to its full price less ₹1, because a payment of nothing cannot be processed.</li>
          <li>If an order paid partly with credit is cancelled, the credit comes back to you.</li>
        </ul>
      </Section>

      <Section heading="5. Creators">
        <p>
          Sometimes we give a code to someone who writes or films about clothes for an
          audience. She is thanked in money rather than credit, on exactly the
          conditions above, and she is asked to say plainly, wherever she shares the
          code, that she earns when it is used. If you see a ZISUN code in a post that
          does not say so, tell us.
        </p>
      </Section>

      <Section heading="6. What we will not do">
        <ul className="list-disc pl-5 space-y-1.5">
          <li>We will not message you to push you to share, or remind you that you have not.</li>
          <li>We will not tell you who used your code. You see that an order was placed and where it stands, never a name, a number or an address.</li>
          <li>We will not put a countdown on it, rank you against other customers, or promise that anyone can make an income from it.</li>
          <li>We will not ask your friend for anything beyond what any customer gives us to deliver an order.</li>
        </ul>
      </Section>

      <Section heading="7. Fair use">
        <p>
          A code is for telling people you actually know, or an audience that actually
          follows you. We may pause a code, and withhold a thank-you, where it has been
          used otherwise: orders placed to earn the credit rather than to wear the
          piece, a code posted to coupon-listing sites, or several accounts for one
          household. We will tell you if we do, and you can write to us at{" "}
          {COMPANY.email} if you think we have it wrong.
        </p>
      </Section>

      <Section heading="8. Changes">
        <p>
          We may change the amounts, or end the arrangement, for future orders. An order
          already placed with your code keeps the terms it was placed under.
        </p>
        <p>
          Our <Link href="/refund" className="underline underline-offset-2">exchange policy</Link>,{" "}
          <Link href="/privacy" className="underline underline-offset-2">privacy policy</Link> and{" "}
          <Link href="/terms" className="underline underline-offset-2">terms</Link> apply to every order, shared or not.
        </p>
      </Section>
    </LegalPage>
  );
}
