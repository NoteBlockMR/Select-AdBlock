const { test } = require('node:test');
const assert = require('node:assert/strict');
const { identify } = require('../identity.js');
test('광고 영상 링크의 ID로 식별하고 추적 쿼리는 무시한다', () => {
  assert.equal(identify({ videoLinks: ['https://www.youtube.com/watch?v=abcdefghijk&utm_source=ad'] }).key, 'video:abcdefghijk');
});
test('도메인만 같다는 이유로 광고를 차단하지 않는다', () => {
  assert.equal(identify({ landing: 'https://example.com/item' }), null);
  assert.notEqual(identify({ title: '첫 번째 광고', landing: 'https://example.com/item' }).key, identify({ title: '두 번째 광고', landing: 'https://example.com/item' }).key);
});
test('추적 주소나 잘못된 링크는 식별에 사용하지 않는다', () => {
  for (const landing of ['javascript:alert(1)', 'https://googleadservices.com/pagead/aclk?x=1', 'invalid']) assert.equal(identify({ title: '테스트 광고 제목', landing }), null);
  assert.equal(identify({ videoLinks: ['https://evil.com/watch?v=abcdefghijk'] }), null);
});
test('같은 소재의 추적 파라미터 변경은 허용한다', () => {
  assert.deepEqual(identify({ title: '테스트 광고', landing: 'https://example.com/item?utm_source=a' }), identify({ title: '테스트 광고', landing: 'https://example.com/item?utm_source=b' }));
});
