(() => {
  const MAX_ITEMS = 6;
  const DEFAULT_SIDEBARS = [
    '.sidebar', '.desk-sidebar', '.standard-sidebar', '.page-sidebar', '.layout-side-section'
  ];
  const ANCHOR_SELECTOR = '.standard-sidebar-section.nested-container';

  let dock, observer, lastRoute = '';

  const log = (...a) => console.debug('[mini-dock]', ...a);

  function getSidebar() {
    const prefer = window.MINIDOCK_SIDEBAR_SELECTOR ? [window.MINIDOCK_SIDEBAR_SELECTOR] : [];
    for (const sel of [...prefer, ...DEFAULT_SIDEBARS]) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function ensureDock() {
    if (!dock) {
      dock = document.getElementById('minimizedDock');
      if (!dock) {
        dock = document.createElement('div');
        dock.id = 'minimizedDock';
        dock.className = 'fallback__minimized';          // visible until placed
        document.body.appendChild(dock);
      }
    }
    return dock;
  }

  function placeDock() {
    ensureDock();
    const sidebar = getSidebar();
    if (!sidebar) return; // keep fallback visible

    // Find ALL anchors and pick the last one in DOM order
    const anchors = sidebar.querySelectorAll(ANCHOR_SELECTOR);
    if (anchors.length > 0) {
      const lastAnchor = anchors[anchors.length - 1];
      dock.className = 'sidebar__minimized';
      lastAnchor.insertAdjacentElement('afterend', dock);
      log('dock placed after LAST anchor', anchors.length);
    } else {
      // If no anchors yet, append at end of sidebar
      dock.className = 'sidebar__minimized';
      sidebar.appendChild(dock);
      log('dock appended at end (no anchors found)');
    }
  }

  // ---- Minimized button creation ----
  function parseFormEntry(routeArr) {
    if (!routeArr || routeArr[0] !== 'Form') return null;
    const [, doctype, name] = routeArr;
    if (!doctype || !name) return null;
    return { doctype, docname: decodeURIComponent(name), key: routeArr.join('/'), route: routeArr };
  }

  function makeMiniButton(entry) {
    const btn = document.createElement('div');
    btn.className = 'minibtn';
    btn.dataset.route = entry.key;

    const icon = document.createElement('div'); icon.className = 'minibtn__icon'; icon.textContent = '📄';
    const labels = document.createElement('div'); labels.className = 'minibtn__labels';
    const l1 = document.createElement('div'); l1.className = 'minibtn__doctype'; l1.textContent = entry.doctype;
    const l2 = document.createElement('div'); l2.className = 'minibtn__docname'; l2.textContent = entry.docname;
    labels.append(l1, l2);

    const close = document.createElement('button'); close.className = 'minibtn__close'; close.title = 'Remove'; close.textContent = '×';
    close.addEventListener('click', (e) => { e.stopPropagation(); btn.remove(); });

    btn.append(icon, labels, close);
    btn.addEventListener('click', () => {
      if (window.frappe?.set_route) window.frappe.set_route(entry.route);
      else location.hash = '#' + entry.key;
    });

    return btn;
  }

  function addToDock(entry) {
    ensureDock();
    const existing = dock.querySelector(`.minibtn[data-route="${CSS.escape(entry.key)}"]`);
    if (existing) { dock.prepend(existing); return; }
    dock.prepend(makeMiniButton(entry));
    [...dock.querySelectorAll('.minibtn')].slice(MAX_ITEMS).forEach(n => n.remove());
    // After adding, re-place to ensure it's still after the last anchor
    placeDock();
  }

  // ---- Routing / observing ----
  function getRouteArr() {
    try {
      return window.frappe?.get_route ? window.frappe.get_route()
        : (location.hash || '').replace(/^#/, '').split('/');
    } catch { return []; }
  }
  function routeStr(a){ return (a || []).join('/'); }

  function onRouteChange() {
    const nowArr = getRouteArr();
    const nowStr = routeStr(nowArr);

    const prevArr = lastRoute ? lastRoute.split('/').map(decodeURIComponent) : null;
    if (prevArr && prevArr[0] === 'Form' && nowStr !== lastRoute) {
      const entry = parseFormEntry(prevArr);
      if (entry) addToDock(entry);
    }
    lastRoute = nowStr;

    // Layout may change after routing; re-place asynchronously
    setTimeout(placeDock, 0);
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(() => placeDock());
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function init() {
    ensureDock();
    startObserver();
    placeDock();

    if (window.frappe?.router?.on) {
      window.frappe.router.on('change', onRouteChange);
    } else {
      window.addEventListener('hashchange', onRouteChange);
    }
    lastRoute = routeStr(getRouteArr());

    // manual test helper
    window.__miniDockTestPin = () => {
      const e = parseFormEntry(getRouteArr());
      if (e) addToDock(e);
    };
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
