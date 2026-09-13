const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const fs = require('node:fs');
const path = require('node:path');
const flush = () => new Promise(resolve => setImmediate(resolve));
const markup = (id, video = 'abcdefghijk') => `<ytd-rich-item-renderer id="${id}"><ytd-in-feed-ad-layout-renderer><a id="video-title" href="https://www.youtube.com/watch?v=${video}">공명자 전투 모션 | 경연</a><span id="channel-name">명조:워더링 웨이브</span></ytd-in-feed-ad-layout-renderer></ytd-rich-item-renderer>`;
async function setup(identifiable = true) {
  const dom = new JSDOM(markup('ad1') + markup('ad2', 'lmnopqrstuv') + '<ytd-rich-item-renderer id="organic"><ytd-rich-grid-media><a>스폰서 광고라는 제목의 일반 영상</a></ytd-rich-grid-media></ytd-rich-item-renderer>', { url: 'https://www.youtube.com', runScripts: 'outside-only' });
  const w = dom.window, roots = [], data = {}; let changed, scan;
  if (!identifiable) w.document.querySelector('#ad1 a').removeAttribute('href');
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
    assert.deepEqual(s.data, {}); assert.equal(s.w.document.querySelector('#ad1').style.display, '');
  } finally { s.close(); }
});
test('예를 누른 광고만 저장·숨기고 해제하면 다시 표시한다', async () => {
  const s = await setup();
  try {
    s.roots[0].querySelector('#block').click(); s.roots[0].querySelector('#yes').click(); await flush();
    const key = 'blocked:card:video:abcdefghijk';
    assert.ok(s.data[key]); assert.equal(s.w.document.querySelector('#ad1').style.display, 'none');
    assert.equal(s.w.document.querySelector('#ad2').style.display, ''); assert.equal(s.w.document.querySelector('#organic').style.display, '');
    s.change({ [key]: { newValue: undefined } }); assert.equal(s.w.document.querySelector('#ad1').style.display, '');
  } finally { s.close(); }
});
test('동일 광고가 추가되면 자동으로 숨기고 재사용된 다른 광고 카드는 복원한다', async () => {
  const s = await setup();
  try {
    s.roots[0].querySelector('#block').click(); s.roots[0].querySelector('#yes').click(); await flush();
    s.w.document.body.insertAdjacentHTML('beforeend', markup('ad3')); await s.scan();
    assert.equal(s.w.document.querySelector('#ad3').style.display, 'none');
    s.w.document.querySelector('#ad1 a').href = 'https://www.youtube.com/watch?v=01234567890'; await s.scan();
    assert.equal(s.w.document.querySelector('#ad1').style.display, '');
    s.change({ enabled: { newValue: false } }); assert.equal(s.w.document.querySelector('#ad3').style.display, '');
  } finally { s.close(); }
});
test('확인 중 다른 광고로 바뀌면 새 광고를 숨기지 않는다', async () => {
  const s = await setup();
  try {
    s.roots[0].querySelector('#block').click();
    s.w.document.querySelector('#ad1 a').href = 'https://www.youtube.com/watch?v=01234567890';
    s.roots[0].querySelector('#yes').click(); await flush();
    assert.ok(s.data['blocked:card:video:abcdefghijk']); assert.equal(s.w.document.querySelector('#ad1').style.display, '');
  } finally { s.close(); }
});
test('식별 불가 카드는 이번만 숨기고 내용이 바뀌면 복원한다', async () => {
  const s = await setup(false);
  try {
    s.roots[0].querySelector('#block').click(); assert.match(s.roots[0].querySelector('#description').textContent, /이번에/);
    s.roots[0].querySelector('#yes').click(); await flush();
    assert.deepEqual(s.data, {}); assert.equal(s.w.document.querySelector('#ad1').style.display, 'none');
    s.w.document.querySelector('#ad1 a').textContent = '다른 광고'; await s.scan();
    assert.equal(s.w.document.querySelector('#ad1').style.display, '');
  } finally { s.close(); }
});
