// assets/your_app/js/minimize-to-sidebar.js
(() => {
  const MAX_ITEMS = 6;
  const DEFAULT_SELECTORS = [
    '.sidebar',
    '.desk-sidebar',
    '.standard-sidebar',
    '.page-sidebar',
    '.layout-side-section'
  ];
  const LOG = (...a) => console.debug('[mini-dock]', ...a);

  let dock;                       // the dock element (single instance)
  let host;                       // where the dock is currently attached
  let observer;                   // MutationObserver to detect sidebars

  function getSidebarSelectorList() {
    const first = window.MINIDOCK_SIDEBAR_SELECTOR ? [window.MINIDOCK_SIDEBAR_SELECTOR] : [];
    return [...first, ...DEFAULT_SELECTORS];
  }

  function findSidebar() {
    for (const sel of getSidebarSelectorList()) {
      const el = document.querySelector(sel);
      if (el) { LOG('sidebar found via', sel); return el; }
    }
    return null;
  }

  function createDockEl(className) {
    const el = document.createElement('div');
    el.id = 'minimizedDock';
    el.className = className;
    return el;
  }

  function ensureDock() {
    // Create dock if not exists (fallback on body so it’s visible)
    if (!dock) {
      dock = document.getElementById('minimizedDock') ||
             createDockEl('fallback__minimized');
      if (!dock.parentElement) document.body.appendChild(dock);
    }
    return dock;
  }

  function moveDockTo(newHost) {
    if (!dock) ensureDock();
    if (!newHost || host === newHost) return;
    dock.className = 'sidebar__minimized'; // switch to sidebar styling
    newHost.appendChild(dock);
    host = newHost;
    LOG('dock moved into sidebar');
  }

  function maybeAttachToSidebarNow() {
    const s = findSidebar();
    if (s) moveDockTo(s);
  }

  function startObserving() {
    if (observer) return;
    observer = new MutationObserver(() => {
      // On any DOM changes, try to relocate dock into a sidebar
      maybeAttachToSidebarNow();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
    LOG('mutation observer started');
  }

  function routeStrOf(arr) { return (arr || []).join('/'); }
  function getRouteArr() {
    try {
      return window.frappe?.get_route ? window.frappe.get_route()
        : (location.hash || '').replace(/^#/, '').split('/');
    } catch { return []; }
  }

  function parseFormTitle(routeArr) {
    if (!routeArr || routeArr[0] !== 'Form') return null;
    const [, doctype, name] = routeArr;
    if (!doctype || !name) return null;
    const docname = decodeURIComponent(name);
    return { label: `${doctype}: ${docname}`, icon: '📄', key: routeArr.join('/'), route: routeArr };
  }

  function makeMiniButton(entry) {
    const btn = document.createElement('div');
    btn.className = 'minibtn';
    btn.dataset.route = entry.key;

    const icon = document.createElement('div'); icon.className = 'minibtn__icon'; icon.textContent = entry.icon;
    const label = document.createElement('div'); label.className = 'minibtn__label'; label.textContent = entry.label;
    const close = document.createElement('button'); close.className = 'minibtn__close'; close.title = 'Remove'; close.textContent = '×';
    close.addEventListener('click', (e) => { e.stopPropagation(); btn.remove(); });

    btn.append(icon, label, close);
    btn.addEventListener('click', () => {
      if (window.frappe?.set_route) window.frappe.set_route(entry.route);
      else location.hash = '#' + entry.key;
    });

    return btn;
  }

  function addToDock(entry) {
    ensureDock();
    const sel = `.minibtn[data-route="${CSS.escape(entry.key)}"]`;
    const existing = dock.querySelector(sel);
    if (existing) { dock.prepend(existing); return; }
    const btn = makeMiniButton(entry);
    dock.prepend(btn);
    [...dock.querySelectorAll('.minibtn')].slice(MAX_ITEMS).forEach(n => n.remove());
  }

  // Manual pin for testing
  function pinCurrentIfForm() {
    const entry = parseFormTitle(getRouteArr());
    if (entry) addToDock(entry);
  }

  // Route tracking
  let last = routeStrOf(getRouteArr());
  function handleRouteChange() {
    const nowArr = getRouteArr();
    const nowStr = routeStrOf(nowArr);
    const prevArr = last ? last.split('/').map(decodeURIComponent) : null;

    if (prevArr && prevArr[0] === 'Form' && nowStr !== last) {
      const entry = parseFormTitle(prevArr);
      if (entry) addToDock(entry);
    }
    last = nowStr;

    // Each route may render a different layout; try to move dock again
    setTimeout(maybeAttachToSidebarNow, 0);
  }

  function attach() {
    ensureDock();
    startObserving();
    maybeAttachToSidebarNow();

    window.__miniDockTestPin = pinCurrentIfForm;

    if (window.frappe?.router?.on) {
      window.frappe.router.on('change', handleRouteChange);
      LOG('attached to frappe.router change');
    } else {
      window.addEventListener('hashchange', handleRouteChange);
      LOG('attached to hashchange');
    }

    last = routeStrOf(getRouteArr());
    LOG('initialized; current route =', last);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();
