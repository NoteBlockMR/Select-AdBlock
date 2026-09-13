(() => {
  'use strict';
  const AD_SELECTOR = 'ytd-in-feed-ad-layout-renderer, ytd-promoted-video-renderer, ytd-display-ad-renderer, ytd-promoted-sparkles-web-renderer';
  const states = new Map();
  let records = {}, enabled = true, pending = false;
  const normalize = value => (value || '').replace(/\s+/g, ' ').trim();
  function identity(ad) {
    const title = normalize(ad.querySelector('#video-title, .yt-lockup-metadata-view-model__title, [role="heading"], #headline, .headline')?.textContent);
    const links = [...ad.querySelectorAll('a[href]')].map(a => a.href);
    const identified = AdIdentity.identify({ videoLinks: links, title });
    if (identified) return { ...identified, key: `card:${identified.key}`, label: `[광고 카드] ${identified.label}` };
    // Thumbnail video IDs identify a creative without storing click-tracking URLs.
    const image = ad.querySelector('img');
    let thumbnail = '';
    try {
      const url = new URL(image?.currentSrc || image?.src);
      if (/(^|\.)ytimg\.com$/.test(url.hostname)) {
        const id = url.pathname.match(/^\/vi(?:_webp)?\/([\w-]{11})\//)?.[1];
        if (id) return { key: `card:video:${id}`, label: `[광고 카드] ${title || id}` };
      }
      if (url.protocol === 'https:') thumbnail = url.origin + url.pathname;
    } catch {}
    const advertiser = normalize(ad.querySelector('#channel-name, .yt-content-metadata-view-model__metadata-text, #ad-badge-container + *, .ytwAdInfoViewModelHost')?.textContent);
    if (!title || !advertiser || !thumbnail) return null;
    return { key: `card:creative:${JSON.stringify([title, advertiser, thumbnail])}`, label: `[광고 카드] ${title}` };
  }
  function restore(state) {
    if (!state.hidden) return;
    if (state.card.style.getPropertyValue('display') === 'none') {
      if (state.display) state.card.style.setProperty('display', state.display, state.priority);
      else state.card.style.removeProperty('display');
    }
    state.hidden = false;
  }
  function hide(state) {
    if (state.hidden) return;
    state.display = state.card.style.getPropertyValue('display');
    state.priority = state.card.style.getPropertyPriority('display');
    state.card.style.setProperty('display', 'none', 'important');
    state.hidden = true;
  }
  function create(ad, card) {
    const host = document.createElement('div');
    host.setAttribute('data-gollamakgi-card-control', '');
    host.style.cssText = 'display:block;margin:8px 0;';
    const root = host.attachShadow({ mode: 'closed' });
    root.innerHTML = `<style>
      :host{font:13px/1.5 system-ui,sans-serif}button{font:inherit;cursor:pointer;border:1px solid #8886;border-radius:18px;padding:6px 12px;background:var(--yt-spec-badge-chip-background,#eee);color:var(--yt-spec-text-primary,#111)}
      button:hover{filter:brightness(.9)}button:focus-visible{outline:2px solid #6b85e8;outline-offset:3px}
      dialog{box-sizing:border-box;width:min(380px,90vw);border:1px solid #555;border-radius:16px;padding:24px;background:#202024;color:#fff;font:14px/1.6 system-ui}dialog::backdrop{background:#0009}
      h2{font-size:20px;margin:0 0 12px}p{color:#ccc;overflow-wrap:anywhere}footer{display:flex;justify-content:flex-end;gap:8px}#yes{background:#a8b8ff;color:#12162a}
    </style><button id="block" type="button">이 광고 차단</button>
    <dialog aria-labelledby="question"><h2 id="question">이 광고를 차단하시겠습니까?</h2><p id="description"></p><p id="error" role="status"></p><footer><button id="no" type="button">아니요</button><button id="yes" type="button">예</button></footer></dialog>`;
    const state = { ad, card, host, root, hidden: false, once: false };
    const dialog = root.querySelector('dialog');
    for (const event of ['click', 'keydown', 'keyup']) host.addEventListener(event, e => e.stopPropagation());
    root.querySelector('#no').onclick = () => dialog.close();
    root.querySelector('#block').onclick = () => {
      const selected = identity(ad);
      const snapshot = ad.innerHTML;
      root.querySelector('#description').textContent = selected
        ? `“${selected.label.replace(/^\[광고 카드\] /, '')}” 광고 카드를 숨깁니다. 같은 광고 카드가 다시 나오면 자동으로 숨깁니다.`
        : '이 광고를 기억할 정보가 부족합니다. 이번에 표시된 광고 카드만 숨길까요?';
      root.querySelector('#error').textContent = '';
      const yes = root.querySelector('#yes'); yes.disabled = false;
      yes.onclick = async () => {
        yes.disabled = true;
        try {
          if (selected) {
            const record = { ...selected, createdAt: Date.now() };
            await chrome.storage.local.set({ ['blocked:' + selected.key]: record });
            records['blocked:' + selected.key] = record;
          }
          if (!selected && ad.innerHTML === snapshot) { state.once = true; state.snapshot = snapshot; }
          dialog.close(); scan();
        } catch {
          root.querySelector('#error').textContent = '저장하지 못했습니다. 다시 시도해 주세요.'; yes.disabled = false;
        }
      };
      dialog.showModal(); root.querySelector('#no').focus();
    };
    // Outside the clickable creative: no new link/navigation target over the ad.
    ad.after(host);
    return state;
  }
  function scan() {
    pending = false;
    for (const [ad, state] of states) {
      if (!ad.isConnected) { restore(state); state.host.remove(); states.delete(ad); }
    }
    // Explicit YouTube ad renderers only. Never classify ordinary video titles as ads.
    for (const ad of document.querySelectorAll(AD_SELECTOR)) {
      if (ad.parentElement?.closest(AD_SELECTOR)) continue;
      const wrapper = ad.closest('ytd-rich-item-renderer');
      // Collapse a grid slot only if it contains one ad and no organic video card.
      const card = wrapper && wrapper.querySelectorAll(AD_SELECTOR).length === 1 && !wrapper.querySelector('ytd-rich-grid-media, ytd-video-renderer, ytd-grid-video-renderer') ? wrapper : ad;
      let state = states.get(ad);
      if (state && state.card !== card) { restore(state); state.host.remove(); states.delete(ad); state = null; }
      if (!state) { state = create(ad, card); states.set(ad, state); }
      if (ad.nextElementSibling !== state.host) ad.after(state.host);
      if (state.once && state.snapshot !== ad.innerHTML) state.once = false;
      const current = identity(ad);
      const blocked = enabled && (state.once || (current && records['blocked:' + current.key]));
      if (blocked) { state.root.querySelector('dialog').close(); hide(state); }
      else restore(state);
      const display = enabled && !blocked ? 'block' : 'none';
      if (state.host.style.display !== display) state.host.style.display = display;
    }
  }
  function schedule() {
    if (!pending) { pending = true; setTimeout(scan, 100); }
  }
  chrome.storage.local.get(null).then(data => {
    records = data; enabled = data.enabled !== false; scan();
    const observer = new MutationObserver(schedule);
    observer.observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['href', 'src'] });
  }).catch(() => {});
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    for (const [key, change] of Object.entries(changes)) {
      if (key === 'enabled') enabled = change.newValue !== false;
      if (key.startsWith('blocked:')) { if (change.newValue) records[key] = change.newValue; else delete records[key]; }
    }
    scan();
  });
})();
