import { describe, expect, it } from 'vitest';
import { formatVaultPublication } from './formatVaultPublication';

describe('formatVaultPublication', () => {
  it('maps a raw vault_publications row to a Publication', () => {
    const result = formatVaultPublication({
      id: 'vp-1',
      created_by: 'user-1',
      title: 'A Paper',
      authors: ['Ada'],
      year: 2024,
      notes: 'some notes',
      reading_state: 'read',
      important: true,
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });

    expect(result.id).toBe('vp-1');
    expect(result.user_id).toBe('user-1');
    expect(result.notes).toBe('some notes');
    expect(result.reading_state).toBe('read');
    expect(result.important).toBe(true);
  });

  it('defaults reading_state to unread and important to false when absent', () => {
    const result = formatVaultPublication({ id: 'vp-1', created_by: 'user-1', title: 'T' });
    expect(result.reading_state).toBe('unread');
    expect(result.important).toBe(false);
  });

  it('passes through notes as undefined when the raw row omits it (matches current buggy realtime payload shape)', () => {
    const result = formatVaultPublication({ id: 'vp-1', created_by: 'user-1', title: 'T' });
    expect(result.notes).toBeUndefined();
  });

  it('merging the existing Publication under an incomplete realtime payload before formatting preserves fields the payload omits', () => {
    // Simulates VaultContentContext's realtime UPDATE handler: Postgres can omit
    // unchanged TOASTed columns (e.g. large `notes`) from the payload when a
    // different column is updated. `{ ...existing, ...incompletePayload }` before
    // formatting must fall back to the existing value for anything the payload
    // doesn't actually include, while still applying genuinely changed fields.
    const existing = formatVaultPublication({
      id: 'vp-1',
      created_by: 'user-1',
      title: 'T',
      notes: 'long notes that would get TOASTed',
      reading_state: 'unread',
    });

    // Realtime payload for an update that only touched reading_state — no `notes` key at all.
    const incompletePayload = { id: 'vp-1', created_by: 'user-1', title: 'T', reading_state: 'read' };

    const merged = formatVaultPublication({ ...existing, ...incompletePayload });

    expect(merged.notes).toBe('long notes that would get TOASTed');
    expect(merged.reading_state).toBe('read');
  });

  it('the same merge preserves notes when the update instead touches important (reported symptom: important toggle also wiped notes)', () => {
    // important and reading_state go through the exact same onUpdateReadingState
    // handler and DB write path (see PublicationCard.tsx), so an update that only
    // touches `important` is just as capable of omitting unchanged, TOASTed
    // `notes` from the realtime payload as one that touches `reading_state`.
    const existing = formatVaultPublication({
      id: 'vp-1',
      created_by: 'user-1',
      title: 'T',
      notes: 'long notes that would get TOASTed',
      important: false,
    });

    // Realtime payload for an update that only touched important — no `notes` key at all.
    const incompletePayload = { id: 'vp-1', created_by: 'user-1', title: 'T', important: true };

    const merged = formatVaultPublication({ ...existing, ...incompletePayload });

    expect(merged.notes).toBe('long notes that would get TOASTed');
    expect(merged.important).toBe(true);
  });
});
