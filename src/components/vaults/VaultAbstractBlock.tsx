import React from 'react';

interface VaultAbstractBlockProps {
  abstract?: string | null;
  description?: string | null;
}

const VaultAbstractBlock: React.FC<VaultAbstractBlockProps> = ({ abstract, description }) => {
  const hasDescription = Boolean(description);
  const hasAbstract = Boolean(abstract);

  if (!hasDescription && !hasAbstract) {
    return (
      <div className="mb-1">
        <p className="text-xs text-muted-foreground/60 font-mono mb-1">// description</p>
        <p className="text-sm text-muted-foreground font-mono">// no_description_provided</p>
      </div>
    );
  }

  return (
    <div className="mb-1 space-y-2">
      {hasDescription && (
        <div>
          <p className="text-xs text-muted-foreground/60 font-mono mb-1">// tagline</p>
          <p className="text-sm font-semibold text-foreground/90">{description}</p>
        </div>
      )}
      {hasAbstract && (
        <div>
          <p className="text-xs text-muted-foreground/60 font-mono mb-1">// abstract</p>
          <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">{abstract}</p>
        </div>
      )}
    </div>
  );
};

export default VaultAbstractBlock;
