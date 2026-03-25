import { LegalDocumentLayout } from "@/components/layout/LegalDocumentLayout";

const sections = [
  {
    heading: "overview",
    body: [
      "refhub is a web application for organizing research materials, references, notes, and related account activity. this privacy policy explains, at a high level, what information we collect, how we use it, and the choices available to users.",
      "this document describes the current refhub privacy policy for v1 and service transparency, subject to applicable law.",
    ],
  },
  {
    heading: "information we collect",
    body: [
      "we may collect information you provide directly, such as your name, email address, account credentials, profile details, and research content that you choose to upload, save, or generate within refhub.",
      "we may also collect technical and usage information needed to operate the service, including device, browser, ip address, approximate location derived from ip, authentication provider details, page activity, and diagnostic logs.",
    ],
  },
  {
    heading: "how we use information",
    body: [
      "we use information to provide and maintain refhub, authenticate users, secure accounts, sync saved content, improve product performance, communicate essential service updates, and respond to support or abuse issues.",
      "we may use aggregated or de-identified information to understand usage patterns, monitor reliability, and guide product improvements, provided that such information does not reasonably identify individual users.",
    ],
  },
  {
    heading: "oauth and third-party services",
    body: [
      "if you sign in with google or another third-party identity provider, we receive the account information that provider makes available to refhub, such as your email address, display name, and provider-specific identifier.",
      "we use that information only to authenticate you, create or maintain your refhub account, and support related security and account recovery workflows. your use of third-party sign-in services is also subject to those providers' own terms and privacy practices.",
    ],
  },
  {
    heading: "sharing",
    body: [
      "we do not sell personal information. we may share information with service providers and infrastructure vendors that help us host, authenticate, secure, analyze, or support refhub, subject to appropriate contractual or operational safeguards.",
      "we may also disclose information if reasonably necessary to comply with law, enforce our terms of service, protect the rights or safety of refhub, our users, or others, or as part of a business transfer such as a merger, acquisition, or asset sale.",
    ],
  },
  {
    heading: "data retention and security",
    body: [
      "we retain information for as long as reasonably necessary to provide the service, comply with legal obligations, resolve disputes, and enforce our agreements. retention periods may vary depending on the type of data and the operational need.",
      "we use reasonable administrative, technical, and organizational safeguards to protect information. no method of storage or transmission is completely secure, and we cannot guarantee absolute security.",
    ],
  },
  {
    heading: "your choices",
    body: [
      "you may update certain account information within refhub. you may also choose not to provide some information, but that may limit your ability to use parts of the service.",
      "requests relating to account access, correction, or deletion can be directed to the contact address below. we will review requests in light of applicable law, security needs, and operational requirements.",
    ],
  },
  {
    heading: "contact",
    body: [
      "for privacy-related questions or requests, contact refhub at support@refhub.io.",
      "if refhub materially changes this privacy policy, the updated version will be posted on this page with a revised effective date.",
    ],
  },
] as const;

export default function PrivacyPolicy() {
  return (
    <LegalDocumentLayout
      title="privacy policy"
      eyebrow="privacy"
      summary="refhub collects the minimum information needed to operate account access, save your research workspace, and keep the service secure and reliable."
      lastUpdated="march 25, 2026"
      icon="privacy"
      sections={[...sections]}
    />
  );
}
