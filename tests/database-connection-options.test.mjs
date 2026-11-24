import assert from 'node:assert/strict';
import test from 'node:test';
import {
  isPooledEndpoint,
  parseMigrateOnStartup,
} from '../src/lib/server/db/connection-options.ts';

test('pooled endpoints disable prepared statements', () => {
  assert.equal(
    isPooledEndpoint('postgresql://u:p@ep-cool-name-123-pooler.ap-southeast-1.aws.neon.tech/ppob'),
    true,
  );
  assert.equal(
    isPooledEndpoint('postgresql://u:p@ep-cool-name-123.ap-southeast-1.aws.neon.tech/ppob'),
    false,
  );
  assert.equal(isPooledEndpoint('postgres://ppob:pw@127.0.0.1:5432/ppob'), false);
  assert.equal(isPooledEndpoint('not a url'), false);
});

test('migrate-on-startup defaults to enabled and rejects unknown values', () => {
  assert.equal(parseMigrateOnStartup(undefined), true);
  assert.equal(parseMigrateOnStartup(''), true);
  assert.equal(parseMigrateOnStartup('true'), true);
  assert.equal(parseMigrateOnStartup('1'), true);
  assert.equal(parseMigrateOnStartup('FALSE'), false);
  assert.equal(parseMigrateOnStartup(' 0 '), false);
  assert.throws(() => parseMigrateOnStartup('yes'));
});
