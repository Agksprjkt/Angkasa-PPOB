import assert from 'node:assert/strict';
import test from 'node:test';
import {
  defaultLegalContent,
  isLegalDocumentId,
  legalDocumentIds,
  parseLegalContent,
} from '../src/lib/legal-content.ts';

test('parses headings and paragraphs from plain legal text', () => {
  const blocks = parseLegalContent(
    ['## Judul Satu', 'Paragraf pertama.', 'Paragraf kedua.', '', 'Masih bagian yang sama.'].join('\n'),
  );
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].heading, 'Judul Satu');
  assert.deepEqual(blocks[0].paragraphs, [
    'Paragraf pertama.',
    'Paragraf kedua.',
    'Masih bagian yang sama.',
  ]);
});

test('text before the first heading becomes a headingless block', () => {
  const blocks = parseLegalContent(['Pembuka.', '', '## Bagian', 'Isi.'].join('\n'));
  assert.equal(blocks.length, 2);
  assert.equal(blocks[0].heading, null);
  assert.deepEqual(blocks[0].paragraphs, ['Pembuka.']);
  assert.equal(blocks[1].heading, 'Bagian');
  assert.deepEqual(blocks[1].paragraphs, ['Isi.']);
});

test('ignores blank content and stray separators', () => {
  assert.deepEqual(parseLegalContent(''), []);
  assert.deepEqual(parseLegalContent('\n\n   \n'), []);
  assert.deepEqual(parseLegalContent('##\n'), []);
});

test('every document id has substantial default content with headings', () => {
  for (const id of legalDocumentIds) {
    const content = defaultLegalContent(id, 'Angkasa Pay');
    assert.ok(content.length > 300, `${id} content too short`);
    assert.ok(content.includes('## '), `${id} has no heading`);
    assert.ok(content.includes('Angkasa Pay') || id === 'disclaimer', `${id} missing brand name`);
    const blocks = parseLegalContent(content);
    assert.ok(blocks.length >= 2, `${id} should have multiple sections`);
    assert.ok(blocks.every((block) => block.paragraphs.length > 0), `${id} has empty section`);
  }
});

test('unknown ids are rejected', () => {
  assert.equal(isLegalDocumentId('tentang'), true);
  assert.equal(isLegalDocumentId('unknown'), false);
});
