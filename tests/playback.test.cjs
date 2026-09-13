const { test } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { AdPlayback } = require('../playback.js');
function fixture() {
  const dom = new JSDOM('<video style="opacity:0.8"></video>');
  const video = dom.window.document.querySelector('video');
  Object.defineProperty(video, 'duration', { value: 30 });
  video.playbackRate = 1.5;
  return { dom, video, controller: new AdPlayback() };
}
test('건너뛰기 버튼과 seekable 정보 없이 끝으로 이동하고 음소거·가속한다', () => {
  const { dom, video, controller } = fixture();
  try {
    controller.apply(video, 'ad1');
    assert.equal(video.currentTime, 29.95); assert.equal(video.muted, true);
    assert.equal(video.playbackRate, 16); assert.equal(video.style.opacity, '0');
    controller.apply(video, 'ad1'); controller.restore();
    assert.equal(video.playbackRate, 1.5); assert.equal(video.muted, false); assert.equal(video.style.opacity, '0.8');
  } finally { dom.window.close(); }
});
test('탐색이 거부되어도 가리기·음소거·가속은 유지한다', () => {
  const { dom, video, controller } = fixture();
  try {
    Object.defineProperty(video, 'currentTime', { get: () => 0, set: () => { throw new Error('seek blocked'); } });
    controller.apply(video, 'ad1'); assert.equal(video.muted, true); assert.equal(video.playbackRate, 16);
    controller.restore(); assert.equal(video.playbackRate, 1.5);
  } finally { dom.window.close(); }
});
test('미디어 종료·교체 이벤트에서 원래 상태를 즉시 복원한다', () => {
  for (const event of ['ended', 'emptied', 'loadstart']) {
    const { dom, video, controller } = fixture();
    try {
      controller.apply(video, 'ad1'); video.dispatchEvent(new dom.window.Event(event));
      assert.equal(controller.active, null); assert.equal(video.muted, false); assert.equal(video.playbackRate, 1.5); assert.equal(video.style.opacity, '0.8');
    } finally { dom.window.close(); }
  }
});
