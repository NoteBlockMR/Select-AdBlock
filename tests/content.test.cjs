const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const flush = () => new Promise(resolve => setImmediate(resolve));
async function setup(data = {}, identifiable = true) {
  const dom = new JSDOM(`<div id="movie_player" class="ad-showing"><video></video><div class="ytp-ad-player-overlay">${identifiable ? '<a href="https://www.youtube.com/watch?v=abcdefghijk">광고</a>' : ''}</div><button class="ytp-ad-skip-button">Skip</button></div>`, { url: 'https://www.youtube.com/watch?v=MAINVIDEO12', runScripts: 'outside-only' });
  const w = dom.window; let root, tick, skips = 0;
  const metadata = w.document.createElement('ytd-watch-metadata');
  metadata.innerHTML = '<div id="title"><h1>영상 제목</h1></div>';
  w.document.body.append(metadata);
  const original = w.Element.prototype.attachShadow;
  w.Element.prototype.attachShadow = function (opts) { root = original.call(this, opts); return root; };
  w.Element.prototype.getClientRects = () => [{}];
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.setInterval = fn => { tick = fn; };
  w.chrome = { storage: { local: { get: async () => ({ ...data }), set: async values => Object.assign(data, values) }, onChanged: { addListener() {} } } };
  w.document.querySelector('.ytp-ad-skip-button').onclick = () => skips++;
  for (const name of ['identity.js', 'playback.js', 'content.js']) w.eval(fs.readFileSync(path.join(__dirname, '..', name), 'utf8'));
  await flush();
  return { w, data, root, tick, skips: () => skips, close: () => w.close() };
}
test('취소는 저장하거나 광고를 건너뛰지 않는다', async () => {
  const s = await setup();
  try { s.root.querySelector('#block').click(); s.root.querySelector('#no').click(); await flush(); assert.deepEqual(s.data, {}); assert.equal(s.skips(), 0); } finally { s.close(); }
});
test('예를 누른 광고만 저장하고 건너뛴다', async () => {
  const s = await setup();
  try {
    assert.equal(s.w.document.querySelector('ytd-watch-metadata #title').nextElementSibling, s.root.host);
    assert.equal(s.w.document.querySelector('#movie_player').contains(s.root.host), false);
    assert.equal(s.skips(), 0); s.root.querySelector('#block').click(); s.root.querySelector('#yes').click(); await flush(); assert.ok(s.data['blocked:video:abcdefghijk']); assert.equal(s.skips(), 1);
  } finally { s.close(); }
});
test('확인 도중 바뀐 다른 광고는 건너뛰지 않는다', async () => {
  const s = await setup();
  try { s.root.querySelector('#block').click(); s.w.document.querySelector('a').href = 'https://www.youtube.com/watch?v=lmnopqrstuv'; s.root.querySelector('#yes').click(); await flush(); assert.ok(s.data['blocked:video:abcdefghijk']); assert.equal(s.skips(), 0); } finally { s.close(); }
});
test('저장된 광고는 자동으로 건너뛰고 기능을 끄면 그대로 둔다', async () => {
  for (const enabled of [true, false]) {
    const s = await setup({ enabled, 'blocked:video:abcdefghijk': { label: '광고' } });
    try { assert.equal(s.skips(), enabled ? 1 : 0); } finally { s.close(); }
  }
});
test('일반 영상에서는 저장된 식별 정보가 있어도 동작하지 않는다', async () => {
  const s = await setup();
  try { s.w.document.querySelector('#movie_player').classList.remove('ad-showing'); s.tick(); await flush(); assert.equal(s.root.host.style.display, 'none'); assert.equal(s.skips(), 0); } finally { s.close(); }
});
test('식별 불가 광고는 목록에 저장하지 않는다', async () => {
  const s = await setup({}, false);
  try { s.root.querySelector('#block').click(); assert.match(s.root.querySelector('#description').textContent, /저장할 수 없습니다/); s.root.querySelector('#yes').click(); await flush(); assert.deepEqual(s.data, {}); } finally { s.close(); }
});
test('건너뛰기 불가 광고도 가리고, 일반 영상 전환 시 복원한다', async () => {
  const s = await setup();
  try {
    const video = s.w.document.querySelector('video'); video.playbackRate = 1.25;
    s.w.document.querySelector('.ytp-ad-skip-button').remove();
    s.root.querySelector('#block').click(); s.root.querySelector('#yes').click(); await flush();
    assert.equal(video.muted, true); assert.equal(video.style.opacity, '0'); assert.equal(video.playbackRate, 16);
    s.w.document.querySelector('#movie_player').classList.remove('ad-showing'); await flush();
    assert.equal(video.muted, false); assert.equal(video.playbackRate, 1.25); assert.equal(video.style.opacity, '');
  } finally { s.close(); }
});
test('다른 미차단 광고로 바뀌면 원래 상태로 복원한다', async () => {
  const s = await setup({ 'blocked:video:abcdefghijk': { label: '광고' } });
  try {
    const video = s.w.document.querySelector('video'); assert.equal(video.muted, true);
    s.w.document.querySelector('a').href = 'https://www.youtube.com/watch?v=lmnopqrstuv'; s.tick();
    assert.equal(video.muted, false); assert.equal(video.playbackRate, 1); assert.equal(video.style.opacity, '');
  } finally { s.close(); }
});
