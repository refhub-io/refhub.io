import React from 'react';

interface VaultAbstractBlockProps {
  abstract?: string | null;
  description?: string | null;
}

const VaultAbstractBlock: React.FC<VaultAbstractBlockProps> = ({ abstract, description }) => {
  const text = abstract || description;

  return (
    <div className="mb-1">
      <p className="text-xs text-muted-foreground/60 font-mono mb-1">// description</p>
      {text ? (
        <p className="text-sm text-muted-foreground line-clamp-3 leading-relaxed">{text}</p>
      ) : (
        <p className="text-sm text-muted-foreground font-mono">// no_description_provided</p>
      )}
    </div>
  );
};

export default VaultAbstractBlock;
