'use strict';
const enabled = document.querySelector('#enabled');
const status = document.querySelector('#status');
async function render() {
  try {
    const data = await chrome.storage.local.get(null);
    enabled.checked = data.enabled !== false;
    const entries = Object.entries(data).filter(([key]) => key.startsWith('blocked:')).sort((a, b) => b[1].createdAt - a[1].createdAt);
    document.querySelector('#count').textContent = entries.length;
    document.querySelector('#empty').hidden = entries.length > 0;
    const list = document.querySelector('#list'); list.replaceChildren();
    for (const [key, record] of entries) {
      const row = document.createElement('li'), label = document.createElement('span'), remove = document.createElement('button');
      const legacyCard = key.startsWith('blocked:card:') && !key.startsWith('blocked:card:v2:');
      label.textContent = record.label + (legacyCard ? ' (이전 규칙 · 재등록 필요)' : ''); remove.textContent = '해제'; remove.setAttribute('aria-label', `${record.label} 차단 해제`);
      remove.onclick = async () => { try { await chrome.storage.local.remove(key); } catch { status.textContent = '해제하지 못했습니다. 다시 시도해 주세요.'; } };
      row.append(label, remove); list.append(row);
    }
  } catch { status.textContent = '목록을 불러오지 못했습니다.'; }
}
enabled.onchange = async () => { try { await chrome.storage.local.set({ enabled: enabled.checked }); } catch { enabled.checked = !enabled.checked; status.textContent = '설정을 저장하지 못했습니다.'; } };
chrome.storage.onChanged.addListener(render);
render();
