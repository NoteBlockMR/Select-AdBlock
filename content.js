(() => {
  'use strict';
  const PREFIX = 'blocked:';
  let records = {}, enabled = true, player, host, shadow, blockButton, status, dialog;
  let lastAttempt = 0;
  const playback = new AdPlayback();
  let adObserver, once = null;
  const visible = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  const isAd = () => player?.isConnected && player.classList.contains('ad-showing');
  function first(selector) { return [...player.querySelectorAll(selector)].find(visible); }
  function identity() {
    if (!isAd()) return null;
    // Only inspect ad-specific elements; the watch-page video ID is the main video.
    const title = first('.ytp-ad-title, .ytp-ad-text-headline')?.textContent || '';
    const links = [...player.querySelectorAll('.ytp-ad-player-overlay a[href], .ytp-ad-text a[href], a.ytp-ad-button[href]')].filter(visible);
    const landing = links.map(a => a.href).find(href => {
      try { return !/(^|\.)(youtube\.com|google\.com|googleadservices\.com|doubleclick\.net)$/.test(new URL(href).hostname); } catch { return false; }
    }) || '';
    return AdIdentity.identify({ title, videoLinks: links.map(a => a.href), landing });
  }
  function createUI() {
    host = document.createElement('div');
    host.style.cssText = 'display:none;margin:8px 0 12px;width:100%;';
    shadow = host.attachShadow({ mode: 'closed' });
    shadow.innerHTML = `<style>
      :host{font:13px/1.5 system-ui,sans-serif;color:white}*{box-sizing:border-box}
      button{font:inherit;cursor:pointer;border:1px solid #ffffff45;border-radius:20px;padding:7px 13px;background:#202024;color:white}
      button:hover{background:#393940}button:focus-visible{outline:2px solid #a6b7ff;outline-offset:3px}
      #status{display:block;max-width:260px;background:#18181de8;border-radius:8px;margin-top:6px;padding:4px 8px;font-size:12px}#status:empty{display:none}
      dialog{width:min(380px,90vw);border:1px solid #45454d;border-radius:18px;padding:24px;background:#202024;color:white;font:14px/1.6 system-ui;box-shadow:0 20px 80px #0008}
      dialog::backdrop{background:#0009}h2{font-size:20px;margin:0 0 12px}p{overflow-wrap:anywhere;color:#c8c8d2}footer{display:flex;justify-content:flex-end;gap:8px;margin-top:20px}#yes{background:#a8b8ff;color:#12162a;border:0}
    </style><button id="block" type="button">광고 차단</button><span id="status" role="status"></span>
    <dialog aria-labelledby="question"><h2 id="question">이 광고를 차단하시겠습니까?</h2><p id="description"></p><p id="result" role="status"></p><footer><button id="no" type="button">아니요</button><button id="yes" type="button">예</button></footer></dialog>`;
    blockButton = shadow.querySelector('#block'); status = shadow.querySelector('#status'); dialog = shadow.querySelector('dialog');
    blockButton.addEventListener('click', event => { event.stopPropagation(); confirmBlock(); });
    shadow.querySelector('#no').onclick = () => dialog.close();
    for (const type of ['keydown', 'keyup', 'click']) host.addEventListener(type, e => e.stopPropagation());
  }
  function placeUI() {
    const title = [...document.querySelectorAll('ytd-watch-metadata h1, #info-contents h1')].find(visible);
    if (!title) { host.remove(); return; }
    const anchor = title.closest('#title') || title;
    if (anchor.nextElementSibling !== host) anchor.after(host);
  }
  function confirmBlock() {
    const selected = identity();
    const video = player.querySelector('video');
    const source = video?.currentSrc;
    shadow.querySelector('#description').textContent = selected
      ? `“${selected.label}” 광고를 이 브라우저에 기억합니다. 같은 정보로 식별되는 광고가 다시 나오면 건너뛰기를 시도합니다.`
      : '이 광고의 고유 정보를 확인할 수 없어 목록에 저장할 수 없습니다. 이번 광고만 건너뛰기를 시도할까요?';
    shadow.querySelector('#result').textContent = '';
    const yes = shadow.querySelector('#yes');
    yes.disabled = false;
    yes.onclick = async () => {
      yes.disabled = true;
      try {
        if (selected) {
          const record = { ...selected, createdAt: Date.now() };
          await chrome.storage.local.set({ [PREFIX + selected.key]: record });
          records[PREFIX + selected.key] = record;
        }
        const same = selected ? identity()?.key === selected.key : video === player.querySelector('video') && !!source && source === video.currentSrc;
        if (same && isAd() && enabled) {
          if (!selected) once = { video, source };
          skip(selected?.key || 'once');
        }
        dialog.close();
      } catch {
        shadow.querySelector('#result').textContent = '저장하지 못했습니다. 페이지를 새로고침한 후 다시 시도해 주세요.';
        yes.disabled = false;
      }
    };
    dialog.showModal();
    shadow.querySelector('#no').focus();
  }
  function skip(key) {
    if (!isAd() || !enabled) return;
    const button = first('.ytp-ad-skip-button, .ytp-skip-ad-button, .ytp-ad-skip-button-modern');
    if (button && !button.disabled && Date.now() - lastAttempt > 1000) {
      lastAttempt = Date.now(); button.click();
    }
    if (!isAd()) { playback.restore(); return; }
    const video = player.querySelector('video');
    if (video && (key === 'once' ? once?.video === video && once.source === video.currentSrc : identity()?.key === key)) playback.apply(video, key);
    status.textContent = '선택한 광고를 가렸습니다. 빠른 종료를 시도 중입니다.';
  }
  function tick() {
    const next = document.querySelector('#movie_player');
    if (next !== player) {
      playback.restore(); once = null; adObserver?.disconnect(); host?.remove(); player = next;
      if (player) {
        createUI();
        adObserver = new MutationObserver(tick);
        adObserver.observe(player, { attributes: true, attributeFilter: ['class'] });
      }
    }
    if (!player || !host) return;
    placeUI();
    const active = isAd() && enabled;
    host.style.display = active || dialog.open ? 'block' : 'none';
    if (!active) { playback.restore(); once = null; status.textContent = ''; return; }
    const current = identity();
    const video = player.querySelector('video');
    if (once && (once.video !== video || once.source !== video?.currentSrc || current)) once = null;
    const blocked = current && records[PREFIX + current.key];
    if (!blocked && !once) playback.restore();
    else if (playback.active && !playback.matches(video, current?.key || 'once')) playback.restore();
    blockButton.textContent = blocked ? '차단한 광고' : '광고 차단';
    if (!blocked) status.textContent = '';
    if ((blocked || once) && !dialog.open) skip(current?.key || 'once');
  }
  chrome.storage.local.get(null).then(data => {
    records = data; enabled = data.enabled !== false;
    tick(); setInterval(tick, 500);
  }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [key, change] of Object.entries(changes)) {
      if (key === 'enabled') enabled = change.newValue !== false;
      if (key.startsWith(PREFIX)) { if (change.newValue) records[key] = change.newValue; else delete records[key]; }
    }
    tick();
  });
  window.addEventListener('pagehide', () => { playback.restore(); once = null; });
  document.addEventListener('yt-navigate-start', () => { playback.restore(); once = null; });
  for (const event of ['ended', 'emptied', 'loadstart']) document.addEventListener(event, e => {
    if (e.target === once?.video) once = null;
  }, true);
})();
