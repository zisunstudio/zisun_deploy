import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, Section } from "@/components/legal/LegalPage";
import { COMPANY } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Contact Us | ZISUN",
  description: "How to reach ZISUN customer support.",
};

export default function ContactPage() {
  return (
    <LegalPage title="Contact Us">
      <p>
        A real person reads every message. For anything about an order, include your
        order number and we will get to it faster.
      </p>

      <Section heading="Customer support">
        <p>
          Email:{" "}
          <a href={`mailto:${COMPANY.email}`} className="text-primary underline">
            {COMPANY.email}
          </a>
          <br />
          Phone / WhatsApp:{" "}
          <a
            href={`tel:${COMPANY.phone.replace(/\s/g, "")}`}
            className="text-primary underline"
          >
            {COMPANY.phone}
          </a>
          <br />
          Hours: {COMPANY.supportHours}
        </p>
        <p>We aim to reply within one working day.</p>
      </Section>

      <Section heading="Registered address">
        <p>
          {COMPANY.legalName}
          <br />
          {COMPANY.address}
          {COMPANY.gstin ? (
            <>
              <br />
              GSTIN: {COMPANY.gstin}
            </>
          ) : null}
        </p>
      </Section>

      <Section heading="Grievance Officer">
        <p>
          For complaints or data-protection requests under the DPDP Act, 2023 and the
          Information Technology Act, 2000, write to {COMPANY.email} with
          &ldquo;Grievance&rdquo; in the subject line. We acknowledge within 48 hours
          and respond within 30 days.
        </p>
      </Section>

      <Section heading="Policies">
        <p>
          <Link href="/privacy" className="text-primary underline">
            Privacy Policy
          </Link>
          {" · "}
          <Link href="/terms" className="text-primary underline">
            Terms &amp; Conditions
          </Link>
          {" · "}
          <Link href="/refund" className="text-primary underline">
            Refund &amp; Cancellation
          </Link>
          {" · "}
          <Link href="/shipping" className="text-primary underline">
            Shipping Policy
          </Link>
        </p>
      </Section>
    </LegalPage>
  );
}
