import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NoRecognitionProvider } from './no-recognition-provider';

test('never identifies anything, and never fails', async () => {
  const result = await new NoRecognitionProvider().identify({ externalContentId: 'c1', videoUrls: ['https://example.test/v'] });
  assert.deepEqual(result, { matches: [], error: null });
});
