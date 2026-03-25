import { LegalDocumentLayout } from "@/components/layout/LegalDocumentLayout";

const sections = [
  {
    heading: "Acceptance Of Terms",
    body: [
      "These Terms of Service govern access to and use of RefHub. By using RefHub, you agree to these Terms. If you do not agree, do not use the service.",
      "If you use RefHub on behalf of an organization, you represent that you have authority to bind that organization to these Terms.",
    ],
  },
  {
    heading: "The Service",
    body: [
      "RefHub provides tools for collecting, organizing, annotating, and sharing research-related materials and metadata. We may update, improve, limit, or discontinue features at any time.",
      "Some features may depend on third-party services, integrations, or infrastructure that are outside RefHub's direct control.",
    ],
  },
  {
    heading: "Accounts",
    body: [
      "You are responsible for maintaining the confidentiality of your account credentials and for activity that occurs under your account. You must provide accurate information and keep it reasonably up to date.",
      "You must notify RefHub promptly if you believe your account has been compromised or used without authorization.",
    ],
  },
  {
    heading: "Acceptable Use",
    body: [
      "You may not use RefHub to violate law, infringe intellectual property or privacy rights, interfere with the service, attempt unauthorized access, distribute malware, scrape the service in a harmful manner, or submit content that is unlawful, abusive, or fraudulent.",
      "We may suspend or terminate access if we reasonably believe your use creates legal, security, or operational risk.",
    ],
  },
  {
    heading: "Your Content",
    body: [
      "You retain ownership of content you submit to RefHub, subject to any rights needed for us to operate the service. By submitting content, you grant RefHub a limited license to host, store, process, reproduce, and display that content solely as needed to provide and improve the service.",
      "You are responsible for ensuring that you have the rights needed to upload, save, or share any content you place in RefHub.",
    ],
  },
  {
    heading: "Disclaimers",
    body: [
      "RefHub is provided on an as-is and as-available basis to the extent permitted by law. We do not guarantee uninterrupted service, absolute security, error-free operation, or that the service will meet every research, compliance, or legal requirement.",
      "RefHub is a software product and not a law firm, records custodian, or professional advisor. Content made available through RefHub does not constitute legal, academic, or professional advice.",
    ],
  },
  {
    heading: "Limitation Of Liability",
    body: [
      "To the maximum extent permitted by law, RefHub and its operators will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenues, data, goodwill, or business opportunities arising from or related to the service.",
      "Where liability cannot be excluded, it will be limited to the amount you paid, if any, for the service during the twelve months before the event giving rise to the claim.",
    ],
  },
  {
    heading: "Changes And Contact",
    body: [
      "We may update these Terms from time to time. Continued use of RefHub after updated Terms become effective constitutes acceptance of the revised Terms.",
      "Questions about these Terms may be sent to support@refhub.io.",
    ],
  },
] as const;

export default function TermsOfService() {
  return (
    <LegalDocumentLayout
      title="Terms of Service"
      eyebrow="terms"
      summary="These baseline terms describe the rules for using RefHub, your responsibilities as an account holder, and the standard product disclaimers for launch."
      lastUpdated="March 25, 2026"
      icon="terms"
      sections={[...sections]}
    />
  );
}
