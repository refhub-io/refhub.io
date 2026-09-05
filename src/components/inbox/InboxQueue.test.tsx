import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { KeyboardProvider } from '@/contexts/KeyboardContext';
import { InboxQueue } from './InboxQueue';
import type { InboxItem, Vault, Tag } from '@/types/database';

function makeItem(id: string, title: string): InboxItem {
  return {
    id, user_id: 'user-1', status: 'pending', source_type: 'manual', source_ref: title,
    parsed_fields: { title }, suggested_vault_id: null, suggested_tag_ids: null,
    duplicate_of_publication_id: null, filed_publication_id: null, sort_order: 0,
    created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
  };
}

const vault: Vault = {
  id: 'vault-1', user_id: 'user-1', name: 'My Vault', description: '', color: '#000',
  category: 'research', abstract: '', visibility: 'private', public_slug: null,
  archived_at: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z',
};

describe('InboxQueue', () => {
  it('renders one card per item', () => {
    render(
      <KeyboardProvider>
        <InboxQueue
          items={[makeItem('item-1', 'First'), makeItem('item-2', 'Second')]}
          duplicateTitles={{}} vaults={[vault]} tags={[]}
          onAccept={() => {}} onReject={() => {}} onMerge={() => {}} onPostpone={() => {}}
        />
      </KeyboardProvider>,
    );
    expect(screen.getByText('First')).toBeInTheDocument();
    expect(screen.getByText('Second')).toBeInTheDocument();
  });

  it('pressing "x" rejects the focused (first) item', () => {
    const onReject = vi.fn();
    render(
      <KeyboardProvider>
        <InboxQueue
          items={[makeItem('item-1', 'First'), makeItem('item-2', 'Second')]}
          duplicateTitles={{}} vaults={[vault]} tags={[]}
          onAccept={() => {}} onReject={onReject} onMerge={() => {}} onPostpone={() => {}}
        />
      </KeyboardProvider>,
    );
    fireEvent.keyDown(document, { key: 'x' });
    expect(onReject).toHaveBeenCalledWith('item-1');
  });

  it('pressing "j" moves focus to the next item before acting', () => {
    const onReject = vi.fn();
    render(
      <KeyboardProvider>
        <InboxQueue
          items={[makeItem('item-1', 'First'), makeItem('item-2', 'Second')]}
          duplicateTitles={{}} vaults={[vault]} tags={[]}
          onAccept={() => {}} onReject={onReject} onMerge={() => {}} onPostpone={() => {}}
        />
      </KeyboardProvider>,
    );
    fireEvent.keyDown(document, { key: 'j' });
    fireEvent.keyDown(document, { key: 'x' });
    expect(onReject).toHaveBeenCalledWith('item-2');
  });
});
