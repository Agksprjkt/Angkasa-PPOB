import assert from 'node:assert/strict';
import test from 'node:test';
import { resolveIntegrationSetting } from '../src/lib/server/integration-settings-resolver.ts';

test('environment settings override dashboard values', () => {
  assert.deepEqual(
    resolveIntegrationSetting(' env-value ', 'dashboard-value'),
    { value: 'env-value', source: 'environment' },
  );
});

test('dashboard settings are used when the environment is empty', () => {
  assert.deepEqual(
    resolveIntegrationSetting('  ', 'dashboard-value'),
    { value: 'dashboard-value', source: 'dashboard' },
  );
});

test('unconfigured settings are explicitly unset', () => {
  assert.deepEqual(
    resolveIntegrationSetting(undefined, undefined),
    { value: undefined, source: 'unset' },
  );
});
