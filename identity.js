(function (root) {
  'use strict';
  function identify({ videoLinks = [], title = '', landing = '' }) {
    for (const link of videoLinks) {
      try {
        const url = new URL(link);
        if (!['www.youtube.com', 'youtube.com', 'youtu.be'].includes(url.hostname)) continue;
        const id = url.hostname === 'youtu.be' ? url.pathname.slice(1) : url.searchParams.get('v');
        if (/^[\w-]{11}$/.test(id || '')) return { key: `video:${id}`, label: title.trim() || `광고 영상 ${id}` };
      } catch {}
    }
    // A destination alone would block unrelated creatives from the same advertiser.
    const label = title.replace(/\s+/g, ' ').trim();
    if (label.length < 4 || !landing) return null;
    try {
      const url = new URL(landing);
      if (url.protocol !== 'https:' || /(^|\.)(youtube\.com|google\.com|googleadservices\.com|doubleclick\.net)$/.test(url.hostname)) return null;
      const destination = url.origin + url.pathname.replace(/\/$/, '');
      return { key: `creative:${JSON.stringify([label, destination])}`, label };
    } catch { return null; }
  }
  root.AdIdentity = { identify };
  if (typeof module !== 'undefined') module.exports = { identify };
})(globalThis);
