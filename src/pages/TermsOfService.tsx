import { LegalDocumentLayout } from "@/components/layout/LegalDocumentLayout";

const sections = [
  {
    heading: "acceptance of terms",
    body: [
      "these terms of service govern access to and use of refhub. by using refhub, you agree to these terms. if you do not agree, do not use the service.",
      "if you use refhub on behalf of an organization, you represent that you have authority to bind that organization to these terms.",
    ],
  },
  {
    heading: "the service",
    body: [
      "refhub provides tools for collecting, organizing, annotating, and sharing research-related materials and metadata. we may update, improve, limit, or discontinue features at any time.",
      "some features may depend on third-party services, integrations, or infrastructure that are outside refhub's direct control.",
    ],
  },
  {
    heading: "accounts",
    body: [
      "you are responsible for maintaining the confidentiality of your account credentials and for activity that occurs under your account. you must provide accurate information and keep it reasonably up to date.",
      "you must notify refhub promptly if you believe your account has been compromised or used without authorization.",
    ],
  },
  {
    heading: "acceptable use",
    body: [
      "you may not use refhub to violate law, infringe intellectual property or privacy rights, interfere with the service, attempt unauthorized access, distribute malware, scrape the service in a harmful manner, or submit content that is unlawful, abusive, or fraudulent.",
      "we may suspend or terminate access if we reasonably believe your use creates legal, security, or operational risk.",
    ],
  },
  {
    heading: "your content",
    body: [
      "you retain ownership of content you submit to refhub, subject to any rights needed for us to operate the service. by submitting content, you grant refhub a limited license to host, store, process, reproduce, and display that content solely as needed to provide and improve the service.",
      "you are responsible for ensuring that you have the rights needed to upload, save, or share any content you place in refhub.",
    ],
  },
  {
    heading: "disclaimers",
    body: [
      "refhub is provided on an as-is and as-available basis to the extent permitted by law. we do not guarantee uninterrupted service, absolute security, error-free operation, or that the service will meet every research, compliance, or legal requirement.",
      "refhub is a software product and not a law firm, records custodian, or professional advisor. content made available through refhub does not constitute legal, academic, or professional advice.",
    ],
  },
  {
    heading: "limitation of liability",
    body: [
      "to the maximum extent permitted by law, refhub and its operators will not be liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for lost profits, revenues, data, goodwill, or business opportunities arising from or related to the service.",
      "where liability cannot be excluded, it will be limited to the amount you paid, if any, for the service during the twelve months before the event giving rise to the claim.",
    ],
  },
  {
    heading: "changes and contact",
    body: [
      "we may update these terms from time to time. continued use of refhub after updated terms become effective constitutes acceptance of the revised terms.",
      "questions about these terms may be sent to support@refhub.io.",
    ],
  },
] as const;

export default function TermsOfService() {
  return (
    <LegalDocumentLayout
      title="terms of service"
      eyebrow="terms"
      summary="these baseline terms describe the rules for using refhub, your responsibilities as an account holder, and the core product disclaimers for v1."
      lastUpdated="march 25, 2026"
      icon="terms"
      sections={[...sections]}
    />
  );
}
