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
  const ANCHOR_SELECTOR = '.standard-sidebar-section.nested-container';
  const LOG = (...a) => console.debug('[mini-dock]', ...a);

  let dock, host, anchor, observer;

  function getSidebarSelectorList() {
    const first = window.MINIDOCK_SIDEBAR_SELECTOR ? [window.MINIDOCK_SIDEBAR_SELECTOR] : [];
    return [...first, ...DEFAULT_SELECTORS];
  }

  function findSidebar() {
    for (const sel of getSidebarSelectorList()) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function findAnchor(sidebarEl) {
    if (!sidebarEl) return null;
    // anchor is the specific section inside the sidebar
    return sidebarEl.querySelector(ANCHOR_SELECTOR);
  }

  function ensureDock() {
    if (!dock) {
      dock = document.getElementById('minimizedDock');
      if (!dock) {
        dock = document.createElement('div');
        dock.id = 'minimizedDock';
        dock.className = 'fallback__minimized'; // start visible as fallback
        document.body.appendChild(dock);
      }
    }
    return dock;
  }

  function moveDockTo(sidebarEl, anchorEl) {
    ensureDock();
    if (!sidebarEl) return; // stay fallback until sidebar exists

    // If we already sit in correct spot, skip
    const intendedParent = sidebarEl;
    const alreadyPlaced =
      dock.parentElement === intendedParent &&
      (anchorEl ? dock.previousElementSibling === anchorEl : true);

    if (alreadyPlaced) return;

    dock.className = 'sidebar__minimized';
    if (anchorEl && anchorEl.parentElement === intendedParent) {
      // place directly AFTER the anchor section
      anchorEl.insertAdjacentElement('afterend', dock);
      LOG('dock placed after anchor', ANCHOR_SELECTOR);
    } else {
      // fallback: append inside sidebar
      intendedParent.appendChild(dock);
      LOG('dock appended at end of sidebar (anchor not found)');
    }
    host = sidebarEl;
    anchor = anchorEl || null;
  }

  function maybeAttachToSidebarNow() {
    const s = findSidebar();
    if (!s) return;
    const a = findAnchor(s);
    moveDockTo(s, a);
  }

  function startObserving() {
    if (observer) return;
    observer = new MutationObserver(() => {
      // layouts in Frappe can re-render; keep relocating
      maybeAttachToSidebarNow();
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
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

  // Manual tester
  window.__miniDockTestPin = () => {
    const entry = parseFormTitle(getRouteArr());
    if (entry) addToDock(entry);
    maybeAttachToSidebarNow();
  };

  // Route tracking: minimize previous Form/* on leave
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

    // Re-locate on new layout
    setTimeout(maybeAttachToSidebarNow, 0);
  }

  function attach() {
    ensureDock();
    startObserving();
    maybeAttachToSidebarNow();

    if (window.frappe?.router?.on) {
      window.frappe.router.on('change', handleRouteChange);
    } else {
      window.addEventListener('hashchange', handleRouteChange);
    }
    last = routeStrOf(getRouteArr());
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();
