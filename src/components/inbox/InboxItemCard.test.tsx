import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { InboxItemCard } from './InboxItemCard';
import type { InboxItem, Vault, Tag } from '@/types/database';

const item: InboxItem = {
  id: 'item-1', user_id: 'user-1', status: 'pending', source_type: 'doi', source_ref: '10.1/x',
  parsed_fields: { title: 'Some Paper', authors: ['A. Uthor'], year: 2020 },
  suggested_vault_id: null, suggested_tag_ids: null, duplicate_of_publication_id: null,
  filed_publication_id: null, sort_order: 0,
  created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
};

const vault: Vault = {
  id: 'vault-1', user_id: 'user-1', name: 'My Vault', description: '', color: '#000',
  category: 'research', abstract: '', visibility: 'private', public_slug: null,
  archived_at: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
};

describe('InboxItemCard', () => {
  it('shows the duplicate banner and merge button only when a duplicate was detected', () => {
    const onMerge = vi.fn();
    render(
      <InboxItemCard
        item={item} duplicatePublicationTitle="Existing Paper" vaults={[vault]} tags={[]}
        selectedVaultId={null} selectedTagIds={[]} onVaultChange={() => {}} onTagsChange={() => {}}
        onAccept={() => {}} onReject={() => {}} onMerge={onMerge} onPostpone={() => {}} focused={false}
      />,
    );
    expect(screen.getByText(/existing paper/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /merge/i }));
    expect(onMerge).toHaveBeenCalled();
  });

  it('hides the merge button when no duplicate was detected', () => {
    render(
      <InboxItemCard
        item={item} duplicatePublicationTitle={null} vaults={[vault]} tags={[]}
        selectedVaultId={null} selectedTagIds={[]} onVaultChange={() => {}} onTagsChange={() => {}}
        onAccept={() => {}} onReject={() => {}} onMerge={() => {}} onPostpone={() => {}} focused={false}
      />,
    );
    expect(screen.queryByRole('button', { name: /merge/i })).not.toBeInTheDocument();
  });

  it('calls onAccept/onReject/onPostpone', () => {
    const onAccept = vi.fn(); const onReject = vi.fn(); const onPostpone = vi.fn();
    render(
      <InboxItemCard
        item={item} duplicatePublicationTitle={null} vaults={[vault]} tags={[]}
        selectedVaultId="vault-1" selectedTagIds={[]} onVaultChange={() => {}} onTagsChange={() => {}}
        onAccept={onAccept} onReject={onReject} onMerge={() => {}} onPostpone={onPostpone} focused={false}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /^accept$/i }));
    fireEvent.click(screen.getByRole('button', { name: /reject/i }));
    fireEvent.click(screen.getByRole('button', { name: /postpone/i }));
    expect(onAccept).toHaveBeenCalled();
    expect(onReject).toHaveBeenCalled();
    expect(onPostpone).toHaveBeenCalled();
  });
});
