import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TooltipProvider } from '@/components/ui/tooltip';
import type { Publication } from '@/types/database';
import { PublicationCard } from './PublicationCard';

const publication = {
  id: 'vp-1', user_id: 'user-them', title: 'A shared paper', authors: ['Ada Lovelace'], year: 2024,
  publication_type: 'article', reading_state: 'unread', important: false,
  created_at: '2026-11-01T00:00:00Z', updated_at: '2026-11-01T00:00:00Z',
} as unknown as Publication;

const renderCard = (shared?: { vaultNames: string[]; canEdit: boolean }) =>
  render(
    <TooltipProvider>
      <PublicationCard
        publication={publication}
        tags={[]}
        allTags={[]}
        isSelected={false}
        onToggleSelect={() => {}}
        onExportBibtex={() => {}}
        shared={shared}
      />
    </TooltipProvider>,
  );

describe('PublicationCard', () => {
  it('marks a paper from a vault shared with the user, naming the vault', () => {
    renderCard({ vaultNames: ['their vault'], canEdit: false });
    expect(screen.getByRole('img', { name: 'shared_with_you • view_only • their vault' })).toBeTruthy();
  });

  it("doesn't call a shared paper view-only for an editor", () => {
    renderCard({ vaultNames: ['their vault'], canEdit: true });
    expect(screen.getByRole('img', { name: 'shared_with_you • their vault' })).toBeTruthy();
  });

  it('shows no cue on the user’s own papers', () => {
    renderCard();
    expect(screen.queryByRole('img', { name: /shared_with_you/ })).toBeNull();
  });
});
