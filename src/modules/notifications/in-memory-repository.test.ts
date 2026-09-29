import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { InMemoryNotificationRepository } from './in-memory-repository';

function payload(overrides: Partial<{ caseId: string; contentId: string; creatorUsername: string; status: string }> = {}) {
  return {
    caseId: 'case-1',
    contentId: 'tt-cc-1',
    creatorUsername: 'mia.dances',
    status: 'POTENTIAL_MISMATCH',
    ...overrides,
  };
}

describe('InMemoryNotificationRepository', () => {
  test('create() returns an unread record with a generated id and timestamp', async () => {
    const repo = new InMemoryNotificationRepository();
    const before = Date.now();
    const record = await repo.create({
      workspaceId: 'ws-1',
      userId: 'user-1',
      type: 'CASE_OPENED',
      payload: payload(),
    });
    assert.ok(record.id);
    assert.equal(record.workspaceId, 'ws-1');
    assert.equal(record.userId, 'user-1');
    assert.equal(record.type, 'CASE_OPENED');
    assert.deepEqual(record.payload, payload());
    assert.equal(record.read, false);
    assert.ok(record.createdAt.getTime() >= before);
  });

  test('findForUser() returns only that user\'s notifications in that workspace, newest first', async () => {
    const repo = new InMemoryNotificationRepository();
    const first = await repo.create({ workspaceId: 'ws-1', userId: 'user-1', type: 'CASE_OPENED', payload: payload({ caseId: 'case-1' }) });
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = await repo.create({ workspaceId: 'ws-1', userId: 'user-1', type: 'CASE_OPENED', payload: payload({ caseId: 'case-2' }) });
    // Different user, different workspace — neither should show up for user-1/ws-1.
    await repo.create({ workspaceId: 'ws-1', userId: 'user-2', type: 'CASE_OPENED', payload: payload({ caseId: 'case-3' }) });
    await repo.create({ workspaceId: 'ws-2', userId: 'user-1', type: 'CASE_OPENED', payload: payload({ caseId: 'case-4' }) });

    const results = await repo.findForUser('ws-1', 'user-1');
    assert.equal(results.length, 2);
    assert.equal(results[0].id, second.id);
    assert.equal(results[1].id, first.id);
  });

  test('countUnread() counts only unread notifications for that user/workspace', async () => {
    const repo = new InMemoryNotificationRepository();
    const a = await repo.create({ workspaceId: 'ws-1', userId: 'user-1', type: 'CASE_OPENED', payload: payload() });
    await repo.create({ workspaceId: 'ws-1', userId: 'user-1', type: 'CASE_OPENED', payload: payload() });
    assert.equal(await repo.countUnread('ws-1', 'user-1'), 2);

    await repo.markAllRead('ws-1', 'user-1');
    assert.equal(await repo.countUnread('ws-1', 'user-1'), 0);

    // A new one after marking all read is unread again.
    await repo.create({ workspaceId: 'ws-1', userId: 'user-1', type: 'CASE_OPENED', payload: payload() });
    assert.equal(await repo.countUnread('ws-1', 'user-1'), 1);
    // The earlier ones stay read.
    const all = await repo.findForUser('ws-1', 'user-1');
    assert.equal(all.filter((n) => n.read).length, 2);
    assert.equal(all.find((n) => n.id === a.id)?.read, true);
  });

  test('markAllRead() only affects the given user/workspace, and is a no-op when nothing is unread', async () => {
    const repo = new InMemoryNotificationRepository();
    await repo.create({ workspaceId: 'ws-1', userId: 'user-1', type: 'CASE_OPENED', payload: payload() });
    await repo.create({ workspaceId: 'ws-1', userId: 'user-2', type: 'CASE_OPENED', payload: payload() });

    await repo.markAllRead('ws-1', 'user-1');
    assert.equal(await repo.countUnread('ws-1', 'user-1'), 0);
    assert.equal(await repo.countUnread('ws-1', 'user-2'), 1);

    // Calling it again with nothing left unread should not throw.
    await repo.markAllRead('ws-1', 'user-1');
    assert.equal(await repo.countUnread('ws-1', 'user-1'), 0);
  });
});
