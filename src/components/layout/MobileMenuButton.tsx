import { Menu } from 'lucide-react';

interface MobileMenuButtonProps {
  onClick: () => void;
  className?: string;
}

export function MobileMenuButton({ onClick, className = '' }: MobileMenuButtonProps) {
  return (
    <button
      className={`lg:hidden p-2 text-foreground/80 hover:text-foreground transition-colors ${className}`}
      onClick={onClick}
      aria-label="Open menu"
    >
      <Menu className="w-6 h-6" />
    </button>
  );
}
