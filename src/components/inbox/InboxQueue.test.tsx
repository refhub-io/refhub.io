import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

  it('recovers a sane focused item after "j" while the queue was empty', () => {
    // Regression test: clampedIndex only clamped the upper bound
    // (Math.min(focusedIndex, ...)), not the lower one. Pressing "j" while
    // items.length === 0 computes Math.min(0 + 1, items.length - 1) ===
    // Math.min(1, -1) === -1, and once an item exists again, items[-1] stays
    // undefined -- no focused item -- until an unrelated "k" happens to
    // correct it back to 0.
    const onReject = vi.fn();
    const { rerender } = render(
      <KeyboardProvider>
        <InboxQueue
          items={[]}
          duplicateTitles={{}} vaults={[vault]} tags={[]}
          onAccept={() => {}} onReject={onReject} onMerge={() => {}} onPostpone={() => {}}
        />
      </KeyboardProvider>,
    );
    fireEvent.keyDown(document, { key: 'j' });

    rerender(
      <KeyboardProvider>
        <InboxQueue
          items={[makeItem('item-1', 'First')]}
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

  it('seeds the vault/tag selection from a computed suggestion once it appears on the item', () => {
    // Regression test: the card's own local `selections` state used to always
    // default to { vaultId: null, tagIds: [] } regardless of what
    // suggestVaultForItem/suggestTagsForItem had already computed and written
    // onto the item -- so a correctly-scored suggestion never actually showed
    // up in the vault/tag selects.
    const onAccept = vi.fn();
    const item = { ...makeItem('item-1', 'First'), suggested_vault_id: 'vault-1', suggested_tag_ids: ['tag-1'] };
    const tag: Tag = { id: 'tag-1', user_id: 'user-1', name: 'Important', color: '#f00', parent_id: null, depth: 0, created_at: '2026-01-01T00:00:00.000Z' };
    render(
      <KeyboardProvider>
        <InboxQueue
          items={[item]}
          duplicateTitles={{}} vaults={[vault]} tags={[tag]}
          onAccept={onAccept} onReject={() => {}} onMerge={() => {}} onPostpone={() => {}}
        />
      </KeyboardProvider>,
    );
    expect(screen.getByText('My Vault')).toBeInTheDocument();
    expect(screen.getByText('1 tag_selected')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'a' });
    expect(onAccept).toHaveBeenCalledWith('item-1', 'vault-1', ['tag-1']);
  });

  it('does not clobber a selection the user already changed once a (different) suggestion arrives', async () => {
    const user = userEvent.setup();
    const otherVault: Vault = { ...vault, id: 'vault-2', name: 'Other Vault' };
    const item = makeItem('item-1', 'First');
    const onAccept = vi.fn();
    const { rerender } = render(
      <KeyboardProvider>
        <InboxQueue
          items={[item]}
          duplicateTitles={{}} vaults={[vault, otherVault]} tags={[]}
          onAccept={onAccept} onReject={() => {}} onMerge={() => {}} onPostpone={() => {}}
        />
      </KeyboardProvider>,
    );
    // User picks a vault manually before any suggestion has arrived.
    await user.click(screen.getByRole('combobox'));
    await user.click(await screen.findByRole('option', { name: 'My Vault' }));

    // A suggestion for a *different* vault now lands on the item -- the
    // user's own choice must win, not get silently overwritten.
    rerender(
      <KeyboardProvider>
        <InboxQueue
          items={[{ ...item, suggested_vault_id: 'vault-2', suggested_tag_ids: [] }]}
          duplicateTitles={{}} vaults={[vault, otherVault]} tags={[]}
          onAccept={onAccept} onReject={() => {}} onMerge={() => {}} onPostpone={() => {}}
        />
      </KeyboardProvider>,
    );
    fireEvent.keyDown(document, { key: 'a' });
    expect(onAccept).toHaveBeenCalledWith('item-1', 'vault-1', []);
  });

  it('toggles between card and list view via the toolbar buttons and the "v" shortcut', () => {
    render(
      <KeyboardProvider>
        <InboxQueue
          items={[makeItem('item-1', 'First')]}
          duplicateTitles={{}} vaults={[vault]} tags={[]}
          onAccept={() => {}} onReject={() => {}} onMerge={() => {}} onPostpone={() => {}}
        />
      </KeyboardProvider>,
    );
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /list view/i }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: /title/i })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: 'v' });
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('picks up a duplicateTitles update for "m" even when items/focusedIndex/selections did not change', () => {
    // Regression test: useHotkeys' dependency array only listed
    // [items, focusedIndex, selections] -- duplicateTitles wasn't in it, so
    // once a duplicate was detected asynchronously (after this component's
    // hotkeys had already registered against an empty duplicateTitles), the
    // "m" handler kept reading the stale, empty object forever, even though
    // the merge button itself (driven fresh from props every render) worked.
    const item = makeItem('item-1', 'First');
    // Stable array reference across both renders -- a fresh `[item]` literal
    // per render would itself change `items`' identity and mask the bug this
    // test targets (useHotkeys would re-register anyway, for an unrelated
    // reason, hiding the missing duplicateTitles dependency).
    const itemsArray = [item];
    const onMerge = vi.fn();
    const { rerender } = render(
      <KeyboardProvider>
        <InboxQueue
          items={itemsArray}
          duplicateTitles={{}} vaults={[vault]} tags={[]}
          onAccept={() => {}} onReject={() => {}} onMerge={onMerge} onPostpone={() => {}}
        />
      </KeyboardProvider>,
    );

    // A duplicate is detected for the same item, same items/selections --
    // only duplicateTitles changes.
    rerender(
      <KeyboardProvider>
        <InboxQueue
          items={itemsArray}
          duplicateTitles={{ 'item-1': 'Existing Paper' }} vaults={[vault]} tags={[]}
          onAccept={() => {}} onReject={() => {}} onMerge={onMerge} onPostpone={() => {}}
        />
      </KeyboardProvider>,
    );

    fireEvent.keyDown(document, { key: 'm' });
    expect(onMerge).toHaveBeenCalledWith('item-1');
  });
});
