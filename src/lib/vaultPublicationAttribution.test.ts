import { describe, expect, it } from 'vitest';
import {
  buildVaultPublicationCopyPayload,
  resolveLastUpdatedActivity,
} from './vaultPublicationAttribution';

describe('buildVaultPublicationCopyPayload', () => {
  it('resets identity fields to the current actor when copying a vault publication', () => {
    const payload = buildVaultPublicationCopyPayload(
      {
        id: 'source-row',
        vault_id: 'source-vault',
        original_publication_id: 'pub-1',
        created_at: '2026-03-01T10:00:00.000Z',
        updated_at: '2026-03-02T10:00:00.000Z',
        created_by: 'user-a',
        updated_by: 'user-b',
        version: 4,
        title: 'Copied paper',
      },
      'target-vault',
      'user-c',
      '2026-03-27T14:00:00.000Z',
    );

    expect(payload).toEqual({
      original_publication_id: 'pub-1',
      vault_id: 'target-vault',
      created_at: '2026-03-27T14:00:00.000Z',
      updated_at: '2026-03-27T14:00:00.000Z',
      created_by: 'user-c',
      title: 'Copied paper',
    });
    expect(payload).not.toHaveProperty('updated_by');
    expect(payload).not.toHaveProperty('version');
    expect(payload).not.toHaveProperty('id');
  });
});

describe('resolveLastUpdatedActivity', () => {
  it('prefers the actual updater and update timestamp', () => {
    expect(
      resolveLastUpdatedActivity(
        {
          created_by: 'user-a',
          updated_by: 'user-b',
          created_at: '2026-03-01T10:00:00.000Z',
          updated_at: '2026-03-03T10:00:00.000Z',
        },
        '2026-03-04T10:00:00.000Z',
      ),
    ).toEqual({
      actorId: 'user-b',
      timestamp: '2026-03-03T10:00:00.000Z',
    });
  });

  it('falls back to the creator and creation timestamp for repeated edits without updated_by', () => {
    expect(
      resolveLastUpdatedActivity(
        {
          created_by: 'user-a',
          updated_by: null,
          created_at: '2026-03-01T10:00:00.000Z',
          updated_at: null,
        },
        '2026-03-04T10:00:00.000Z',
      ),
    ).toEqual({
      actorId: 'user-a',
      timestamp: '2026-03-01T10:00:00.000Z',
    });
  });

  it('keeps the activity timestamp even when no user can be resolved', () => {
    expect(
      resolveLastUpdatedActivity(
        {
          created_by: null,
          updated_by: null,
          created_at: null,
          updated_at: '2026-03-05T10:00:00.000Z',
        },
        '2026-03-04T10:00:00.000Z',
      ),
    ).toEqual({
      actorId: null,
      timestamp: '2026-03-05T10:00:00.000Z',
    });
  });
});
