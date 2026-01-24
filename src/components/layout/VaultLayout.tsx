import { Outlet } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';

interface VaultLayoutProps {
  badge?: React.ReactNode;
}

export default function VaultLayout({ badge }: VaultLayoutProps) {
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b-2 border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-3 hover:opacity-80 transition-opacity">
            <div className="w-10 h-10 rounded-xl bg-gradient-primary flex items-center justify-center shadow-lg">
              <Sparkles className="w-5 h-5 text-white" />
            </div>
            <span className="font-bold text-lg">
              <span className="text-gradient">refhub</span>
              <span className="text-foreground/60">.io</span>
            </span>
          </Link>
          {badge && (
            <div className="flex items-center gap-3">
              {badge}
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 py-8">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="border-t-2 border-border mt-16 py-8 text-center">
        <p className="text-sm text-muted-foreground font-mono">
          Powered by <Link to="/" className="text-primary hover:underline">refhub.io</Link>
        </p>
      </footer>
    </div>
  );
}