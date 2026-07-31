import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Network, FileDown, Bot } from 'lucide-react';
import { BrandMark } from '@/components/branding/BrandMark';
import { ThemeToggle } from '@/components/layout/ThemeToggle';
import { Button } from '@/components/ui/button';

// `label` is the snake_case comment heading rendered above each card. It is kept
// separate from `title` on purpose: deriving it from the human-readable title
// only replaced whitespace, so punctuation (e.g. the "&" in "bibtex & apa
// export") leaked into the comment. Decoupling them keeps both readable.
const FEATURES = [
  {
    icon: BookOpen,
    title: 'vaults',
    label: 'vaults',
    body: 'organize papers into vaults — private, shared with collaborators, or public — and keep large libraries navigable with hierarchical tags.',
  },
  {
    icon: Network,
    title: 'citation graphs',
    label: 'citation_graphs',
    body: 'link related work, visualize how papers connect, and annotate the connections with markdown notes.',
  },
  {
    icon: FileDown,
    title: 'bibtex, apa & csv export',
    label: 'export',
    body: 'cite with confidence — export selections as bibtex, apa, or csv, whichever your writing tool or spreadsheet expects.',
  },
  {
    icon: Bot,
    title: 'agentic workflows',
    label: 'agentic_workflows',
    body: 'built for agents too — skills for the refhub cli and drafting papers let agents read, write, and cite alongside you.',
  },
];

export default function Landing() {
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
            <BrandMark className="h-9 w-9 shrink-0 rounded-2xl shadow-lg" />
            <span>
              <span className="text-gradient">refhub</span>
              <span className="text-muted-foreground">.io</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <Link to="/auth" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              sign in
            </Link>
            <ThemeToggle />
          </div>
        </header>

        <main className="flex-1 flex flex-col justify-center gap-10 py-10">
          <div className="space-y-6 max-w-3xl">
            <div className="inline-flex items-center gap-3 rounded-full border border-primary/20 bg-primary/10 px-4 py-2 text-xs font-mono uppercase tracking-[0.24em] text-primary">
              // reference_manager_for_the_command_line_generation
            </div>
            <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
              organize research. build citation networks. share what you find.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
              refhub is a modern reference manager for researchers who live in the terminal.
              collect papers into vaults, tag and cross-link them, and export clean bibtex, apa,
              or csv when it's time to write.
            </p>
            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Button asChild variant="glow" size="lg" className="font-mono gap-2">
                <Link to="/auth">
                  get_started
                  <ArrowRight className="w-4 h-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg" className="font-mono">
                <Link to="/codex">explore the codex</Link>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {FEATURES.map(({ icon: Icon, title, label, body }) => (
              <div
                key={title}
                className="rounded-lg border-2 border-border bg-card/80 p-5 backdrop-blur-xl"
              >
                <Icon className="mb-3 h-5 w-5 text-primary" />
                <p className="font-mono text-sm font-semibold break-words">// {label}</p>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </main>

        <footer className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 px-1 pt-5 text-sm text-muted-foreground">
          <p>&copy; 2026 refhub.io</p>
          <div className="flex items-center gap-4">
            <Link to="/privacy" className="transition-colors hover:text-foreground">privacy</Link>
            <Link to="/tos" className="transition-colors hover:text-foreground">terms</Link>
            <Link to="/codex" className="transition-colors hover:text-foreground">the codex</Link>
          </div>
        </footer>
      </div>
    </div>
  );
}
