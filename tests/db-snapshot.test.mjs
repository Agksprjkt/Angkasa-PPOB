import assert from 'node:assert/strict';
import test from 'node:test';

import {
  backupFileName,
  createDump,
  decodeRows,
  encodeRows,
  parseDump,
  sortTables,
} from '../src/lib/db-snapshot.ts';

const tables = [
  { name: 'transactions', columns: [{ name: 'id', isDate: false }, { name: 'createdAt', isDate: true }], references: ['invoices', 'user'] },
  { name: 'user', columns: [{ name: 'id', isDate: false }], references: [] },
  { name: 'invoices', columns: [{ name: 'id', isDate: false }, { name: 'userId', isDate: false }], references: ['user'] },
];

test('sortTables puts every referenced table first', () => {
  const order = sortTables(tables).map((table) => table.name);
  assert.ok(order.indexOf('user') < order.indexOf('invoices'));
  assert.ok(order.indexOf('invoices') < order.indexOf('transactions'));
});

test('sortTables keeps tables without foreign keys', () => {
  const order = sortTables([{ name: 'store_settings', columns: [], references: [] }]);
  assert.deepEqual(order.map((table) => table.name), ['store_settings']);
});

test('a self reference does not loop forever', () => {
  const order = sortTables([{ name: 'a', columns: [], references: ['a'] }]);
  assert.deepEqual(order.map((table) => table.name), ['a']);
});

test('dates survive the roundtrip as Date objects', () => {
  const when = new Date('2026-11-27T15:00:00.000Z');
  const columns = [{ name: 'createdAt', isDate: true }, { name: 'id', isDate: false }];
  const encoded = encodeRows([{ id: 'x', createdAt: when }], columns);
  assert.equal(encoded[0].createdAt, when.toISOString());
  const decoded = decodeRows(encoded, columns);
  assert.ok(decoded[0].createdAt instanceof Date);
  assert.equal(decoded[0].createdAt.toISOString(), when.toISOString());
});

test('a null date stays null instead of becoming the epoch', () => {
  const columns = [{ name: 'createdAt', isDate: true }];
  assert.equal(decodeRows([{ createdAt: null }], columns)[0].createdAt, null);
});

test('createDump and parseDump roundtrip', () => {
  const dump = createDump('postgres', { user: [{ id: 'u1' }], invoices: [], transactions: [] });
  const parsed = parseDump(JSON.stringify(dump), tables, 'postgres');
  assert.equal(parsed.mode, 'postgres');
  assert.deepEqual(parsed.tables.user, [{ id: 'u1' }]);
});

test('parseDump refuses another dialect', () => {
  const dump = createDump('sqlite', { user: [], invoices: [], transactions: [] });
  assert.throws(() => parseDump(JSON.stringify(dump), tables, 'postgres'), /BACKUP_DIALECT_MISMATCH/);
});

test('parseDump refuses a different table set', () => {
  const dump = createDump('postgres', { user: [], invoices: [] });
  assert.throws(() => parseDump(JSON.stringify(dump), tables, 'postgres'), /BACKUP_SCHEMA_MISMATCH/);
});

test('parseDump refuses an unknown column', () => {
  const dump = createDump('postgres', {
    user: [{ id: 'u1', role: 'admin' }],
    invoices: [],
    transactions: [],
  });
  assert.throws(() => parseDump(JSON.stringify(dump), tables, 'postgres'), /BACKUP_SCHEMA_MISMATCH/);
});

test('parseDump refuses malformed json', () => {
  assert.throws(() => parseDump('not json', tables, 'postgres'), /INVALID_BACKUP_FILE/);
});

test('backupFileName is filesystem safe', () => {
  const name = backupFileName(new Date('2026-11-27T15:00:00.000Z'));
  assert.equal(name, 'ppob-backup-2026-11-27T15-00-00-000Z.json');
});
