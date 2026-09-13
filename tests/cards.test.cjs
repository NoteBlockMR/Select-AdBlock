const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const flush = () => new Promise(resolve => setImmediate(resolve));
const cardKey = id => 'blocked:card:v2:' + JSON.stringify([`video:${id}`, '공명자 전투 모션 | 경연']);
const markup = (id, video = 'abcdefghijk') => `<ytd-rich-item-renderer id="${id}"><ytd-in-feed-ad-layout-renderer><a id="video-title" href="https://www.youtube.com/watch?v=${video}">공명자 전투 모션 | 경연</a><span id="channel-name">명조:워더링 웨이브</span></ytd-in-feed-ad-layout-renderer></ytd-rich-item-renderer>`;
async function setup(identifiable = true, customize = () => {}) {
  const dom = new JSDOM(markup('ad1') + markup('ad2', 'lmnopqrstuv') + '<ytd-rich-item-renderer id="organic"><ytd-rich-grid-media><a>스폰서 광고라는 제목의 일반 영상</a></ytd-rich-grid-media></ytd-rich-item-renderer>', { url: 'https://www.youtube.com', runScripts: 'outside-only' });
  const w = dom.window, roots = [], data = {}; let changed, scan;
  if (!identifiable) w.document.querySelector('#ad1 a').removeAttribute('href');
  customize(w.document, data);
  const attach = w.Element.prototype.attachShadow;
  w.Element.prototype.attachShadow = function (options) { const root = attach.call(this, options); roots.push(root); return root; };
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.setTimeout = fn => { scan = fn; };
  w.chrome = { storage: { local: { get: async () => ({ ...data }), set: async values => Object.assign(data, values) }, onChanged: { addListener: fn => { changed = fn; } } } };
  for (const file of ['identity.js', 'cards.js']) w.eval(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
  await flush();
  return { w, roots, data, close: () => w.close(), change: changes => changed(changes, 'local'), scan: async () => { await flush(); scan?.(); await flush(); } };
}
test('스폰서 카드에만 버튼을 표시하고 아니요는 아무것도 숨기지 않는다', async () => {
  const s = await setup();
  try {
    assert.equal(s.roots.length, 2);
    assert.equal(s.w.document.querySelector('#organic [data-gollamakgi-card-control]'), null);
    s.roots[0].querySelector('#block').click(); s.roots[0].querySelector('#no').click();
    assert.deepEqual(s.data, {}); assert.equal(s.w.document.querySelector('#ad1 ytd-in-feed-ad-layout-renderer').style.display, '');
  } finally { s.close(); }
});
test('예를 누른 광고만 저장·숨기고 해제하면 다시 표시한다', async () => {
  const s = await setup();
  try {
    s.roots[0].querySelector('#block').click(); s.roots[0].querySelector('#yes').click(); await flush();
    const key = cardKey('abcdefghijk');
    assert.ok(s.data[key]); assert.equal(s.w.document.querySelector('#ad1 ytd-in-feed-ad-layout-renderer').style.display, 'none');
    assert.equal(s.w.document.querySelector('#ad2 ytd-in-feed-ad-layout-renderer').style.display, ''); assert.equal(s.w.document.querySelector('#organic').style.display, '');
    s.change({ [key]: { newValue: undefined } }); assert.equal(s.w.document.querySelector('#ad1 ytd-in-feed-ad-layout-renderer').style.display, '');
  } finally { s.close(); }
});
test('동일 광고가 추가되면 자동으로 숨기고 재사용된 다른 광고 카드는 복원한다', async () => {
  const s = await setup();
  try {
    s.roots[0].querySelector('#block').click(); s.roots[0].querySelector('#yes').click(); await flush();
    s.w.document.body.insertAdjacentHTML('beforeend', markup('ad3')); await s.scan();
    assert.equal(s.w.document.querySelector('#ad3 ytd-in-feed-ad-layout-renderer').style.display, 'none');
    s.w.document.querySelector('#ad1 a').href = 'https://www.youtube.com/watch?v=01234567890'; await s.scan();
    assert.equal(s.w.document.querySelector('#ad1 ytd-in-feed-ad-layout-renderer').style.display, '');
    s.change({ enabled: { newValue: false } }); assert.equal(s.w.document.querySelector('#ad3 ytd-in-feed-ad-layout-renderer').style.display, '');
  } finally { s.close(); }
});
test('확인 중 다른 광고로 바뀌면 새 광고를 숨기지 않는다', async () => {
  const s = await setup();
  try {
    s.roots[0].querySelector('#block').click();
    s.w.document.querySelector('#ad1 a').href = 'https://www.youtube.com/watch?v=01234567890';
    s.roots[0].querySelector('#yes').click(); await flush();
    assert.ok(s.data[cardKey('abcdefghijk')]); assert.equal(s.w.document.querySelector('#ad1 ytd-in-feed-ad-layout-renderer').style.display, '');
  } finally { s.close(); }
});
test('식별 불가 카드는 이번만 숨기고 내용이 바뀌면 복원한다', async () => {
  const s = await setup(false);
  try {
    s.roots[0].querySelector('#block').click(); assert.match(s.roots[0].querySelector('#description').textContent, /이번에/);
    s.roots[0].querySelector('#yes').click(); await flush();
    assert.deepEqual(s.data, {}); assert.equal(s.w.document.querySelector('#ad1 ytd-in-feed-ad-layout-renderer').style.display, 'none');
    s.w.document.querySelector('#ad1 a').textContent = '다른 광고'; await s.scan();
    assert.equal(s.w.document.querySelector('#ad1 ytd-in-feed-ad-layout-renderer').style.display, '');
  } finally { s.close(); }
});
test('여러 광고를 감싼 부모와 옆 광고는 숨기지 않는다', async () => {
  const s = await setup(true, doc => {
    const group = doc.createElement('ytd-display-ad-renderer');
    doc.body.append(group); group.append(doc.querySelector('#ad1'), doc.querySelector('#ad2'));
  });
  try {
    assert.equal(s.roots.length, 2);
    s.roots[0].querySelector('#block').click(); s.roots[0].querySelector('#yes').click(); await flush();
    assert.equal(s.w.document.querySelector('ytd-display-ad-renderer').style.display, '');
    assert.equal(s.w.document.querySelector('#ad1').style.display, '');
    assert.equal(s.w.document.querySelector('#ad1 ytd-in-feed-ad-layout-renderer').style.display, 'none');
    assert.equal(s.w.document.querySelector('#ad2 ytd-in-feed-ad-layout-renderer').style.display, '');
  } finally { s.close(); }
});
test('공통 링크·프로필 이미지·blob 영상은 영구 차단 식별자로 사용하지 않는다', async () => {
  const s = await setup(false, doc => {
    for (const ad of doc.querySelectorAll('ytd-in-feed-ad-layout-renderer')) {
      ad.querySelector('a').removeAttribute('href');
      ad.insertAdjacentHTML('afterbegin', '<a href="https://www.youtube.com/watch?v=SHAREDLINK1">공통 링크</a><img src="https://yt3.googleusercontent.com/avatar"><video class="video-stream html5-main-video" src="blob:https://www.youtube.com/1bb41383-0b78-4e6b-8eab-3bd3f55725ce"></video>');
    }
  });
  try {
    s.roots[0].querySelector('#block').click(); s.roots[0].querySelector('#yes').click(); await flush();
    assert.deepEqual(s.data, {});
    assert.equal(s.w.document.querySelector('#ad1 ytd-in-feed-ad-layout-renderer').style.display, 'none');
    assert.equal(s.w.document.querySelector('#ad2 ytd-in-feed-ad-layout-renderer').style.display, '');
  } finally { s.close(); }
});
test('이미지 URL의 쿼리로 구분되는 서로 다른 소재를 함께 숨기지 않는다', async () => {
  const s = await setup(false, doc => {
    let index = 0;
    for (const ad of doc.querySelectorAll('ytd-in-feed-ad-layout-renderer')) {
      ad.querySelector('a').removeAttribute('href');
      ad.insertAdjacentHTML('beforeend', `<div id="thumbnail"><img src="https://images.example.com/creative?id=${++index}"></div>`);
    }
  });
  try {
    s.roots[0].querySelector('#block').click(); s.roots[0].querySelector('#yes').click(); await flush();
    assert.equal(Object.keys(s.data).length, 1);
    assert.equal(s.w.document.querySelector('#ad2 ytd-in-feed-ad-layout-renderer').style.display, '');
  } finally { s.close(); }
});
test('이전 카드 차단 규칙은 새 광고에 적용하지 않는다', async () => {
  const s = await setup(true, (doc, data) => { data['blocked:card:video:abcdefghijk'] = { label: '이전 광고' }; });
  try { assert.equal(s.w.document.querySelector('#ad1 ytd-in-feed-ad-layout-renderer').style.display, ''); }
  finally { s.close(); }
});

