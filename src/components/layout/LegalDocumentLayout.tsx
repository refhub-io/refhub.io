import { Link } from "react-router-dom";
import { ArrowLeft, FileText, Scale, Shield, Sparkles } from "lucide-react";

import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

interface LegalSection {
  heading: string;
  body: string[];
}

interface LegalDocumentLayoutProps {
  title: string;
  eyebrow: string;
  summary: string;
  lastUpdated: string;
  icon: "privacy" | "terms";
  sections: LegalSection[];
}

export function LegalDocumentLayout({
  title,
  eyebrow,
  summary,
  lastUpdated,
  icon,
  sections,
}: LegalDocumentLayoutProps) {
  const DocumentIcon = icon === "privacy" ? Shield : Scale;

  return (
    <div className="min-h-screen overflow-hidden bg-background text-foreground">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_hsl(var(--electric-purple)/0.16),_transparent_42%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_right,_hsl(var(--neon-green)/0.12),_transparent_36%)]" />
      <div className="absolute inset-0 bg-noise" />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-5xl flex-col px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-8 flex items-center justify-between gap-4">
          <Link
            to="/"
            className="inline-flex items-center gap-3 rounded-full border border-border/60 bg-card/70 px-4 py-2 text-sm font-medium text-foreground/90 backdrop-blur transition-colors hover:border-primary/40 hover:text-white"
          >
            <span className="flex h-9 w-9 items-center justify-center rounded-2xl bg-gradient-primary shadow-lg">
              <Sparkles className="h-4 w-4 text-white" />
            </span>
            <span>
              <span className="text-gradient">refhub</span>
              <span className="text-muted-foreground">.io</span>
            </span>
          </Link>

          <div className="flex items-center gap-3">
            <Link
              to="/"
              className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              back
            </Link>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1">
          <Card className="border border-border/60 bg-card/80 shadow-2xl shadow-black/15 backdrop-blur-xl">
            <CardContent className="p-0">
              <div className="border-b border-border/60 px-6 py-8 sm:px-10">
                <div className="mb-4 inline-flex items-center gap-3 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-mono uppercase tracking-[0.24em] text-primary">
                  <DocumentIcon className="h-4 w-4" />
                  {eyebrow}
                </div>

                <div className="space-y-4">
                  <h1 className="max-w-3xl text-4xl font-semibold tracking-tight sm:text-5xl">
                    {title}
                  </h1>
                  <p className="max-w-3xl text-base leading-7 text-muted-foreground sm:text-lg">
                    {summary}
                  </p>
                </div>

                <div className="mt-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                  <span className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/60 px-3 py-1.5 font-mono">
                    <FileText className="h-3.5 w-3.5" />
                    v1 • last_updated: {lastUpdated}
                  </span>
                </div>
              </div>

              <div className="px-6 py-8 sm:px-10">
                <div className="space-y-8">
                  {sections.map((section) => (
                    <section key={section.heading} className="space-y-3">
                      <h2
                        className={cn(
                          "text-xl font-semibold tracking-tight sm:text-2xl",
                          "text-foreground"
                        )}
                      >
                        {section.heading}
                      </h2>
                      <div className="space-y-3 text-sm leading-7 text-muted-foreground sm:text-base">
                        {section.body.map((paragraph) => (
                          <p key={paragraph}>{paragraph}</p>
                        ))}
                      </div>
                    </section>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </main>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-1 pt-5 text-sm text-muted-foreground">
          <p>refhub legal documents v1.</p>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="transition-colors hover:text-foreground">
              privacy
            </Link>
            <Link to="/tos" className="transition-colors hover:text-foreground">
              terms
            </Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
