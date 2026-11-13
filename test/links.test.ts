import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkLink, splitLinks } from '../src/lib/links';

test('links are found without swallowing trailing punctuation', () => {
  const p = splitLinks('See https://example.com/a?b=1, and (https://example.org/x). Thanks');
  assert.deepEqual(p.filter((x) => x.url).map((x) => x.url), ['https://example.com/a?b=1', 'https://example.org/x']);
  assert.equal(p.map((x) => x.text).join(''), 'See https://example.com/a?b=1, and (https://example.org/x). Thanks');
  assert.deepEqual(splitLinks('no links here'), [{ text: 'no links here' }]);
});
test('suspicious patterns are named in plain words; ordinary https links have none', () => {
  assert.deepEqual(checkLink('https://example.com/page')?.warnings, []);
  assert.ok(checkLink('http://example.com')!.warnings[0]!.includes('secure'));
  assert.ok(checkLink('https://192.168.0.1/login')!.warnings.some((x) => x.includes('numbered')));
  assert.ok(checkLink('https://xn--pple-43d.com')!.warnings.some((x) => x.includes('look-alike')));
  assert.ok(checkLink('https://bit.ly/abc')!.warnings.some((x) => x.includes('shortened')));
  assert.ok(checkLink('https://paypal.com@evil.example')!.warnings.some((x) => x.includes('username')));
  assert.equal(checkLink('not a url'), null);
});
