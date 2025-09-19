// assets/your_app/js/minimize-to-sidebar.js
(() => {
  // --- SINGLETON GUARD (prevents double init if file is included twice) ---
  if (window.__MINIDOCK_ACTIVE) return;
  window.__MINIDOCK_ACTIVE = true;

  const MAX_ITEMS = 6;
  const DEFAULT_SIDEBARS = [
    '.sidebar', '.desk-sidebar', '.standard-sidebar', '.page-sidebar', '.layout-side-section'
  ];
  const ANCHOR_SELECTOR = '.standard-sidebar-section.nested-container';

  let dock = null;
  let observer = null;
  let lastRoute = '';
  let placeScheduled = false;

  const log = (...a) => console.debug('[mini-dock]', ...a);

  // ---- Helpers ----
  function debouncePlace() {
    if (placeScheduled) return;
    placeScheduled = true;
    requestAnimationFrame(() => {
      placeScheduled = false;
      placeDock();
    });
  }

  function getSidebar() {
    const prefer = window.MINIDOCK_SIDEBAR_SELECTOR ? [window.MINIDOCK_SIDEBAR_SELECTOR] : [];
    for (const sel of [...prefer, ...DEFAULT_SIDEBARS]) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function ensureSingleDockInDOM() {
    const all = document.querySelectorAll('#minimizedDock');
    if (all.length > 1) {
      // Keep the first; remove extras
      all.forEach((el, i) => { if (i > 0) el.remove(); });
    }
    dock = all[0] || null;
  }

  function ensureDock() {
    ensureSingleDockInDOM();
    if (!dock) {
      dock = document.createElement('div');
      dock.id = 'minimizedDock';
      dock.className = 'fallback__minimized'; // visible until placed
      dock.setAttribute('data-minidock', '1'); // marker to ignore in observers
      document.body.appendChild(dock);
    }
    return dock;
  }

  function placeDock() {
    ensureDock();
    const sidebar = getSidebar();
    if (!sidebar) return; // keep fallback visible

    const anchors = sidebar.querySelectorAll(ANCHOR_SELECTOR);
    let targetParent = sidebar;
    let lastAnchor = null;
    if (anchors.length) lastAnchor = anchors[anchors.length - 1];

    // Already correctly placed? (same parent AND exactly after the last anchor)
    const correctParent = dock.parentElement === targetParent;
    const correctOrder = lastAnchor ? dock.previousElementSibling === lastAnchor
                                    : dock.previousElementSibling && dock.previousElementSibling.matches(ANCHOR_SELECTOR) === false;

    if (correctParent && (lastAnchor ? correctOrder : dock.parentElement === targetParent)) {
      return; // nothing to do
    }

    dock.className = 'sidebar__minimized';

    if (lastAnchor && lastAnchor.parentElement === targetParent) {
      if (dock === lastAnchor.nextElementSibling) return;
      lastAnchor.insertAdjacentElement('afterend', dock);
      log('dock placed after LAST anchor', anchors.length);
    } else {
      if (dock.parentElement !== targetParent || dock.nextElementSibling !== null) {
        targetParent.appendChild(dock);
        log('dock appended at end (no anchors found)');
      }
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

    // De-dup by route key
    const existing = dock.querySelector(`.minibtn[data-route="${CSS.escape(entry.key)}"]`);
    if (existing) {
      dock.prepend(existing);
    } else {
      dock.prepend(makeMiniButton(entry));
    }

    // Trim
    [...dock.querySelectorAll('.minibtn')].slice(MAX_ITEMS).forEach(n => n.remove());

    // Re-place (debounced) to keep after last anchor
    debouncePlace();
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

    // Layout may change after routing; debounce placement
    debouncePlace();
  }

  function removeActiveIfNeeded(currentStr) {
    if (!HIDE_ACTIVE_TAB || !dock) return;
    const active = dock.querySelector(`.minibtn[data-route="${CSS.escape(currentStr)}"]`);
    if (active) active.remove();
  }
  
  function startObserver() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      // Ignore mutations originated within the dock itself to prevent loops
      for (const m of mutations) {
        if (dock && (dock === m.target || (m.target && dock.contains(m.target)))) continue;
        debouncePlace();
        break;
      }
    });
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
removeActiveIfNeeded(lastRoute);
    // Manual tester
    window.__miniDockTestPin = () => {
      const e = parseFormEntry(getRouteArr());
      if (e) addToDock(e);
    };

    log('initialized');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
