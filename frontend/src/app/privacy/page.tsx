import type { Metadata } from "next";
import { LegalPage, Section } from "@/components/legal/LegalPage";
import { COMPANY } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy | ZISUN",
  description: "How ZISUN collects, uses and protects your personal data.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        {COMPANY.legalName} (&ldquo;{COMPANY.brandName}&rdquo;, &ldquo;we&rdquo;,
        &ldquo;us&rdquo;) operates {COMPANY.websiteUrl}. This policy explains what
        personal data we collect, why, and what rights you have under India&rsquo;s
        Digital Personal Data Protection Act, 2023 (DPDP Act).
      </p>

      <Section heading="1. Data we collect">
        <ul className="list-disc list-inside space-y-1">
          <li>
            <strong>Account:</strong> mobile number (used to sign in via OTP), and
            optionally your name and email address.
          </li>
          <li>
            <strong>Orders:</strong> delivery address, items purchased, order value and
            order history.
          </li>
          <li>
            <strong>Payments:</strong> processed by Razorpay. We receive a payment
            confirmation and reference id. <strong>We never see or store your card,
            UPI or bank credentials.</strong>
          </li>
          <li>
            <strong>Usage:</strong> pages viewed, products opened, items added to cart,
            and device/browser information.
          </li>
        </ul>
      </Section>

      <Section heading="2. Why we use it">
        <p>
          To create and secure your account, process and deliver orders, provide
          customer support, send order updates over WhatsApp and SMS, prevent fraud and
          misuse, meet tax and legal obligations, and improve the store.
        </p>
        <p>
          We do <strong>not</strong> sell your personal data, and we do not use it for
          advertising by third parties.
        </p>
      </Section>

      {/* NOTE: this section describes only what actually runs today. Microsoft
          Clarity is NOT deployed — the component and its PII masking were
          deliberately left out of the launch port. If Clarity ships, restore
          the heatmap/session-recording wording here IN THE SAME CHANGE, and
          only once the masking is in place. A privacy policy that describes
          tracking we do not run is inaccurate; one that omits tracking we DO
          run is a compliance failure. */}
      <Section heading="3. Analytics and error monitoring">
        <p>
          We do <strong>not</strong> currently use session recording, heatmaps or
          third-party behavioural analytics on this store.
        </p>
        <p>
          We use error monitoring to capture technical faults — the page that failed
          and the error itself — so we can fix them. It is configured not to send
          personal data.
        </p>
      </Section>

      <Section heading="4. Who we share it with">
        <p>We share the minimum necessary with service providers who help us operate:</p>
        <ul className="list-disc list-inside space-y-1">
          <li><strong>Razorpay</strong> — payment processing</li>
          <li><strong>Shiprocket</strong> and its delivery partners — shipping (name, address, phone)</li>
          <li><strong>Twilio</strong> and <strong>Meta (WhatsApp)</strong> — OTP and order notifications</li>
          <li><strong>Cloud infrastructure and analytics providers</strong> — hosting, error tracking, usage analytics</li>
        </ul>
        <p>
          Some providers process data outside India. Where that happens, we rely on the
          provider&rsquo;s contractual safeguards.
        </p>
      </Section>

      <Section heading="5. How long we keep it">
        <p>
          Order and transaction records are retained as long as required by Indian tax
          and accounting law. Account data is retained while your account is active. You
          may ask us to delete your account at any time (see below).
        </p>
      </Section>

      <Section heading="6. Your rights">
        <p>Under the DPDP Act you may:</p>
        <ul className="list-disc list-inside space-y-1">
          <li>access the personal data we hold about you</li>
          <li>have inaccurate data corrected</li>
          <li>request erasure of your data</li>
          <li>withdraw consent for non-essential processing</li>
          <li>nominate another person to exercise these rights on your behalf</li>
          <li>raise a grievance with us, and escalate to the Data Protection Board of India</li>
        </ul>
        <p>
          To exercise any of these, email <strong>{COMPANY.email}</strong>. We respond
          within 30 days. Note that we may need to retain certain order records even
          after deletion, where the law requires it.
        </p>
      </Section>

      <Section heading="7. Security">
        <p>
          Traffic is encrypted in transit (HTTPS). Sign-in uses one-time passwords
          rather than stored passwords, and payment credentials never reach our servers.
          No system is perfectly secure, but we work to protect your data and will
          notify you and the authorities of a breach as required by law.
        </p>
      </Section>

      <Section heading="8. Children">
        <p>
          The store is not intended for anyone under 18. We do not knowingly collect
          data from children.
        </p>
      </Section>

      <Section heading="9. Changes">
        <p>
          We may update this policy. Material changes will be notified on this page with
          a revised &ldquo;last updated&rdquo; date.
        </p>
      </Section>

      <Section heading="10. Grievance Officer">
        <p>
          As required by the DPDP Act and the Information Technology Act, 2000:
        </p>
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
          Hours: {COMPANY.supportHours}
        </p>
      </Section>
    </LegalPage>
  );
}
