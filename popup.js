const box = document.getElementById('enabled');
const positions = document.getElementById('position');

chrome.storage.local.get(['enabled', 'position']).then((s) => {
  box.checked = s.enabled !== false;
  positions.disabled = !box.checked;
  const radio = positions.querySelector(`input[value="${s.position || 'top'}"]`);
  (radio || positions.querySelector('input')).checked = true;
});

box.onchange = () => {
  positions.disabled = !box.checked;
  chrome.storage.local.set({ enabled: box.checked });
};
positions.onchange = (e) => chrome.storage.local.set({ position: e.target.value });

fetch('data/meta.json')
  .then((r) => r.json())
  .then((m) => {
    document.getElementById('meta').textContent = `${m.subreddits.toLocaleString()} subreddits`;
  })
  .catch(() => {});
