// Shows a "Related communities" panel on subreddit pages. Goes at the top or
// bottom of the sidebar (new and old Reddit), or floats in the bottom-right
// corner if chosen or if no sidebar is found. Reddit is a single-page app, so the URL is polled
// (cheap, and skipped while the tab is hidden).

const SUB_RE = /^\/r\/([A-Za-z0-9_]+)/;
const SIDEBARS = ['#right-sidebar-container', '.side'];
const SHOWN = 10;

let current = null; // lowercase subreddit of the panel being shown
let related = [];
let expanded = false;
let collapsed = false;
let enabled = true;
let position = 'top'; // 'top' | 'bottom' | 'floating'
let host = null;

function applySettings(s) {
  if ('collapsed' in s) collapsed = !!s.collapsed;
  if ('enabled' in s) enabled = s.enabled !== false;
  if ('position' in s) {
    const p = ['top', 'bottom', 'floating'].includes(s.position) ? s.position : 'top';
    if (p !== position) {
      position = p;
      if (host?.isConnected) return mount();
    }
  }
  render();
}

chrome.storage.local.get(['collapsed', 'enabled', 'position']).then(applySettings);
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  const s = {};
  for (const [k, { newValue }] of Object.entries(changes)) s[k] = newValue;
  applySettings(s);
});

function subFromUrl() {
  const m = location.pathname.match(SUB_RE);
  return m && m[1].toLowerCase() !== 'all' && m[1].toLowerCase() !== 'popular' ? m[1] : null;
}

function check() {
  if (document.hidden) return; // background tabs do no work
  const sub = subFromUrl();
  const key = sub && sub.toLowerCase();
  if (key !== current) {
    current = key;
    related = [];
    expanded = false;
    render();
    if (!sub) return;
    chrome.runtime
      .sendMessage({ type: 'related', sub })
      .then((list) => {
        if (current !== key) return;
        // Names become URLs below, so only accept valid subreddit names.
        related = (list || []).filter((s) => /^[A-Za-z0-9_]+$/.test(s));
        render();
      })
      .catch(() => {});
    return;
  }
  // Reddit re-renders and lazily fills the sidebar; put the panel back if needed.
  if (!enabled || !related.length || !host) return;
  if (
    !host.isConnected ||
    (host.dataset.floating && position !== 'floating' && findSidebar()) ||
    (position === 'bottom' && !host.dataset.floating && host.nextElementSibling)
  ) {
    mount();
  }
}

function findSidebar() {
  for (const sel of SIDEBARS) {
    const el = document.querySelector(sel);
    if (el) return el;
  }
  return null;
}

function mount() {
  const sidebar = position === 'floating' ? null : findSidebar();
  if (sidebar) {
    delete host.dataset.floating;
    if (position === 'bottom') sidebar.append(host);
    else sidebar.prepend(host);
  } else {
    host.dataset.floating = '1';
    document.body.append(host);
  }
  render();
}

function pageBackground() {
  for (const el of [document.body, document.documentElement]) {
    const bg = getComputedStyle(el).backgroundColor;
    if (bg && bg !== 'transparent' && bg !== 'rgba(0, 0, 0, 0)') return bg;
  }
  return 'Canvas';
}

function render() {
  if (!enabled || !current || !related.length) {
    host?.remove();
    return;
  }
  if (!host) {
    host = document.createElement('div');
    host.attachShadow({ mode: 'open' });
    mount();
    return;
  }
  if (!host.isConnected) {
    mount();
    return;
  }

  const floating = !!host.dataset.floating;
  const list = expanded ? related : related.slice(0, SHOWN);
  const root = host.shadowRoot;

  const panel = el('div', { className: `panel ${floating ? 'floating' : position}` });
  if (floating) panel.style.background = pageBackground();
  const toggle = el('button', { textContent: collapsed ? 'show' : 'hide' });
  toggle.onclick = () => {
    collapsed = !collapsed;
    chrome.storage.local.set({ collapsed });
    render();
  };
  panel.append(el('header', {}, el('h2', { textContent: 'Related communities' }), toggle));

  if (!collapsed) {
    const ul = el('ul');
    for (const s of list) {
      ul.append(el('li', {}, el('a', { href: `${location.origin}/r/${s}/`, textContent: `r/${s}` })));
    }
    panel.append(ul);
    if (related.length > SHOWN) {
      const more = el('button', { textContent: expanded ? 'show less' : 'show more' });
      more.onclick = () => {
        expanded = !expanded;
        render();
      };
      panel.append(more);
    }
  }

  const style = el('style', { textContent: STYLE });
  root.replaceChildren(style, panel);
}

function el(tag, props = {}, ...children) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

const STYLE = `
  :host { all: initial; display: block; font: 14px/1.4 system-ui, sans-serif; color: inherit; }
  .panel {
    border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
    border-radius: 12px; padding: 10px 14px; margin: 0 0 16px;
  }
  .bottom { margin: 16px 0 0; }
  .floating { position: fixed; right: 16px; bottom: 16px; z-index: 2147483647;
    width: 240px; max-height: 70vh; overflow: auto; margin: 0;
    box-shadow: 0 4px 16px rgb(0 0 0 / 0.25); }
  header { display: flex; justify-content: space-between; align-items: center; gap: 8px; }
  h2 { font-size: 12px; font-weight: 600; text-transform: uppercase;
    letter-spacing: 0.04em; opacity: 0.7; margin: 0; }
  button { all: unset; cursor: pointer; opacity: 0.7; font-size: 12px; padding: 2px 4px; }
  button:hover { opacity: 1; text-decoration: underline; }
  ul { list-style: none; margin: 8px 0 4px; padding: 0; }
  li { margin: 3px 0; }
  a { color: inherit; text-decoration: none; }
  a:hover { text-decoration: underline; }
`;

check();
setInterval(check, 500);
window.addEventListener('popstate', check);
document.addEventListener('visibilitychange', check);
