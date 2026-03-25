import { LegalDocumentLayout } from "@/components/layout/LegalDocumentLayout";

const sections = [
  {
    heading: "Overview",
    body: [
      "RefHub is a web application for organizing research materials, references, notes, and related account activity. This Privacy Policy explains, at a high level, what information we collect, how we use it, and the choices available to users.",
      "This document is intended as a general product policy for launch readiness and service transparency. It does not create custom legal advice or override any non-waivable rights available under applicable law.",
    ],
  },
  {
    heading: "Information We Collect",
    body: [
      "We may collect information you provide directly, such as your name, email address, account credentials, profile details, and research content that you choose to upload, save, or generate within RefHub.",
      "We may also collect technical and usage information needed to operate the service, including device, browser, IP address, approximate location derived from IP, authentication provider details, page activity, and diagnostic logs.",
    ],
  },
  {
    heading: "How We Use Information",
    body: [
      "We use information to provide and maintain RefHub, authenticate users, secure accounts, sync saved content, improve product performance, communicate essential service updates, and respond to support or abuse issues.",
      "We may use aggregated or de-identified information to understand usage patterns, monitor reliability, and guide product improvements, provided that such information does not reasonably identify individual users.",
    ],
  },
  {
    heading: "OAuth And Third-Party Services",
    body: [
      "If you sign in with Google or another third-party identity provider, we receive the account information that provider makes available to RefHub, such as your email address, display name, and provider-specific identifier.",
      "We use that information only to authenticate you, create or maintain your RefHub account, and support related security and account recovery workflows. Your use of third-party sign-in services is also subject to those providers' own terms and privacy practices.",
    ],
  },
  {
    heading: "Sharing",
    body: [
      "We do not sell personal information. We may share information with service providers and infrastructure vendors that help us host, authenticate, secure, analyze, or support RefHub, subject to appropriate contractual or operational safeguards.",
      "We may also disclose information if reasonably necessary to comply with law, enforce our Terms of Service, protect the rights or safety of RefHub, our users, or others, or as part of a business transfer such as a merger, acquisition, or asset sale.",
    ],
  },
  {
    heading: "Data Retention And Security",
    body: [
      "We retain information for as long as reasonably necessary to provide the service, comply with legal obligations, resolve disputes, and enforce our agreements. Retention periods may vary depending on the type of data and the operational need.",
      "We use reasonable administrative, technical, and organizational safeguards to protect information. No method of storage or transmission is completely secure, and we cannot guarantee absolute security.",
    ],
  },
  {
    heading: "Your Choices",
    body: [
      "You may update certain account information within RefHub. You may also choose not to provide some information, but that may limit your ability to use parts of the service.",
      "Requests relating to account access, correction, or deletion can be directed to the contact address below. We will review requests in light of applicable law, security needs, and operational requirements.",
    ],
  },
  {
    heading: "Contact",
    body: [
      "For privacy-related questions or requests, contact RefHub at support@refhub.io.",
      "If RefHub materially changes this Privacy Policy, the updated version will be posted on this page with a revised effective date.",
    ],
  },
] as const;

export default function PrivacyPolicy() {
  return (
    <LegalDocumentLayout
      title="Privacy Policy"
      eyebrow="privacy"
      summary="RefHub collects the minimum information needed to operate account access, save your research workspace, and keep the service secure and reliable."
      lastUpdated="March 25, 2026"
      icon="privacy"
      sections={[...sections]}
    />
  );
}
