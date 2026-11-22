import assert from 'node:assert/strict';
import { test } from 'node:test';
import { normalizeMoneyInput, parseWhole } from '../src/lib/wholeAmount.ts';

test('accepts Arabic-Indic and Eastern Arabic-Indic whole amounts', () => {
  assert.equal(parseWhole('٣٠٠'), 300);
  assert.equal(parseWhole('۳۰۰'), 300);
  assert.equal(normalizeMoneyInput('٣۰0'), '300');
});

test('does not treat a localized decimal amount as whole dollars', () => {
  assert.equal(parseWhole('٣٫٥'), null);
  assert.equal(normalizeMoneyInput('٣٫٥'), '3.5');
});

test('accepts valid Arabic thousands grouping and rejects malformed grouping', () => {
  assert.equal(parseWhole('٣٬٠٠٠'), 3000);
  assert.equal(parseWhole('٣٬٥'), null);
});
