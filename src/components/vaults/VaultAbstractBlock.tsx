import React from 'react';

interface VaultAbstractBlockProps {
  abstract?: string | null;
  description?: string | null;
}

const VaultAbstractBlock: React.FC<VaultAbstractBlockProps> = ({ abstract, description }) => {
  const hasDescription = Boolean(description);
  const hasAbstract = Boolean(abstract);

  if (!hasDescription && !hasAbstract) {
    return <p className="text-sm text-muted-foreground font-mono mb-1">// no_description_provided</p>;
  }

  return (
    <div className="mb-1 space-y-1">
      {hasDescription && <p className="text-sm font-semibold text-foreground/90">{description}</p>}
      {hasAbstract && (
        <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">{abstract}</p>
      )}
    </div>
  );
};

export default VaultAbstractBlock;
