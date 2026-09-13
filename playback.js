(function (root) {
  'use strict';
  class AdPlayback {
    constructor() { this.active = null; }
    restore() {
      const state = this.active;
      if (!state) return;
      this.active = null;
      const { video } = state;
      for (const event of ['ended', 'emptied', 'loadstart']) video.removeEventListener(event, state.cleanup);
      // Restore only values still owned by us; preserve subsequent user/site changes.
      if (video.playbackRate === state.appliedRate) video.playbackRate = state.rate;
      if (video.muted === true) video.muted = state.muted;
      if (video.style.getPropertyValue('opacity') === '0') {
        if (state.opacity) video.style.setProperty('opacity', state.opacity, state.priority);
        else video.style.removeProperty('opacity');
      }
    }
    matches(video, key) {
      return this.active?.video === video && this.active.key === key && this.active.source === video.currentSrc;
    }
    apply(video, key) {
      if (!this.matches(video, key)) this.restore();
      if (!this.active) {
        const state = { video, key, source: video.currentSrc, rate: video.playbackRate, muted: video.muted,
          opacity: video.style.getPropertyValue('opacity'), priority: video.style.getPropertyPriority('opacity') };
        state.cleanup = () => this.restore();
        this.active = state;
        for (const event of ['ended', 'emptied', 'loadstart']) video.addEventListener(event, state.cleanup);
      }
      video.muted = true;
      video.style.setProperty('opacity', '0', 'important');
      // No dependency on YouTube's skip button or advertised seekable ranges.
      if (Number.isFinite(video.duration) && video.duration > 0 && video.currentTime < video.duration - 0.1) {
        try { video.currentTime = Math.max(0, video.duration - 0.05); } catch {}
      }
      for (const rate of [16, 8, 4, 2]) {
        try { video.playbackRate = rate; this.active.appliedRate = video.playbackRate; break; } catch {}
      }
    }
  }
  root.AdPlayback = AdPlayback;
  if (typeof module !== 'undefined') module.exports = { AdPlayback };
})(globalThis);
