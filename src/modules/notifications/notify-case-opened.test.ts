import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { notifyCaseOpened } from './notify-case-opened';
import { InMemoryNotificationRepository } from './in-memory-repository';

describe('notifyCaseOpened', () => {
  test('creates one notification per recipient, all carrying the same payload', async () => {
    const notificationRepository = new InMemoryNotificationRepository();
    const payload = {
      caseId: 'case-1',
      contentId: 'tt-cc-1',
      creatorUsername: 'mia.dances',
      status: 'POTENTIAL_MISMATCH',
    };

    const created = await notifyCaseOpened(
      { workspaceId: 'ws-1', recipientUserIds: ['user-1', 'user-2', 'user-3'], payload },
      { notificationRepository },
    );

    assert.equal(created.length, 3);
    assert.ok(created.every((n) => n.type === 'CASE_OPENED'));
    assert.ok(created.every((n) => n.workspaceId === 'ws-1'));
    assert.ok(created.every((n) => n.read === false));
    assert.deepEqual(new Set(created.map((n) => n.userId)), new Set(['user-1', 'user-2', 'user-3']));

    for (const userId of ['user-1', 'user-2', 'user-3']) {
      const forUser = await notificationRepository.findForUser('ws-1', userId);
      assert.equal(forUser.length, 1);
      assert.deepEqual(forUser[0].payload, payload);
    }
  });

  test('an empty recipient list creates nothing and does not throw', async () => {
    const notificationRepository = new InMemoryNotificationRepository();
    const created = await notifyCaseOpened(
      {
        workspaceId: 'ws-1',
        recipientUserIds: [],
        payload: { caseId: 'case-1', contentId: 'tt-cc-1', creatorUsername: 'mia.dances', status: 'UNKNOWN' },
      },
      { notificationRepository },
    );
    assert.deepEqual(created, []);
  });
});
