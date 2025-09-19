// assets/your_app/js/minimize-to-sidebar.js
(() => {
  // Singleton guard
  if (window.__MINIDOCK_ACTIVE) return;
  window.__MINIDOCK_ACTIVE = true;

  const MAX_ITEMS = 12;
  const SIDEBAR_SELECTOR = '.layout-side-section'; // <-- keep it on layout side section
  const ANCHOR_SELECTOR = '.standard-sidebar-section.nested-container';
  const HIDE_ACTIVE_TAB = true; // <-- new behavior

  let dock = null, observer = null, lastRoute = '', placeScheduled = false;

  const routeStr = a => (a || []).join('/');

  function getRouteArr() {
    try {
      return window.frappe?.get_route ? window.frappe.get_route()
        : (location.hash || '').replace(/^#/, '').split('/');
    } catch { return []; }
  }

  function debouncePlace() {
    if (placeScheduled) return;
    placeScheduled = true;
    requestAnimationFrame(() => { placeScheduled = false; placeDock(); });
  }

  function getSidebar() {
    // Use the last visible .layout-side-section
    const nodes = [...document.querySelectorAll(SIDEBAR_SELECTOR)]
      .filter(el => el && el.offsetParent !== null);
    return nodes.length ? nodes[nodes.length - 1] : null;
  }

  function ensureDock() {
    dock = document.getElementById('minimizedDock');
    if (!dock) {
      dock = document.createElement('div');
      dock.id = 'minimizedDock';
      dock.className = 'sidebar__minimized';
    }
    return dock;
  }

  function placeDock() {
    ensureDock();
    const sidebar = getSidebar();
    if (!sidebar) {
      if (dock.parentElement) dock.parentElement.remove();
      return;
    }
    const anchors = sidebar.querySelectorAll(ANCHOR_SELECTOR);
    const lastAnchor = anchors.length ? anchors[anchors.length - 1] : null;

    // Already right after last anchor?
    if (dock.parentElement === sidebar && lastAnchor && dock.previousElementSibling === lastAnchor) return;

    if (lastAnchor && lastAnchor.parentElement === sidebar) {
      lastAnchor.insertAdjacentElement('afterend', dock);
    } else {
      // If no standard sections yet, append at end
      if (dock.parentElement !== sidebar) sidebar.appendChild(dock);
    }
  }

  // ----- entries (two-line) -----
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

    const labels = document.createElement('div');
    labels.className = 'minibtn__labels';

    const l1 = document.createElement('div');
    l1.className = 'minibtn__doctype';
    l1.textContent = entry.doctype;

    const l2 = document.createElement('div');
    l2.className = 'minibtn__docname';
    l2.textContent = entry.docname;

    labels.append(l1, l2);
    btn.append(labels);

    btn.addEventListener('click', () => {
      // Navigate to the form. The onRouteChange handler will remove this tab if HIDE_ACTIVE_TAB is true.
      if (window.frappe?.set_route) window.frappe.set_route(entry.route);
      else location.hash = '#' + entry.key;
    });

    return btn;
  }

  function addOrBump(entry) {
    ensureDock(); placeDock();

    const sel = `.minibtn[data-route="${CSS.escape(entry.key)}"]`;
    const existing = dock.querySelector(sel);
    if (existing) dock.prepend(existing);
    else dock.prepend(makeMiniButton(entry));

    // Trim
    [...dock.querySelectorAll('.minibtn')].slice(MAX_ITEMS).forEach(n => n.remove());

    // Re-place to stay after the last standard section
    debouncePlace();
  }

  function removeActiveIfNeeded(currentStr) {
    if (!HIDE_ACTIVE_TAB || !dock) return;
    const active = dock.querySelector(`.minibtn[data-route="${CSS.escape(currentStr)}"]`);
    if (active) active.remove();
  }

  // ----- routing / observing -----
  function onRouteChange() {
    const nowArr = getRouteArr();
    const nowStr = routeStr(nowArr);

    // When leaving a Form/*, add it to dock
    const prevArr = lastRoute ? lastRoute.split('/').map(decodeURIComponent) : null;
    if (prevArr && prevArr[0] === 'Form' && nowStr !== lastRoute) {
      const entry = parseFormEntry(prevArr);
      if (entry) addOrBump(entry);
    }

    // When opening a tab's page, remove it from dock (requested behavior)
    removeActiveIfNeeded(nowStr);

    lastRoute = nowStr;
    debouncePlace();
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(muts => {
      for (const m of muts) {
        if (dock && (m.target === dock || (dock.contains && dock.contains(m.target)))) continue;
        debouncePlace();
        break;
      }
    });
    observer.observe(document.documentElement, { childList: true, subtree: true });
  }

  function init() {
    ensureDock();
    placeDock();
    startObserver();

    if (window.frappe?.router?.on) window.frappe.router.on('change', onRouteChange);
    else window.addEventListener('hashchange', onRouteChange);

    lastRoute = routeStr(getRouteArr());
    // If you land directly on a Form, make sure its tab isn't there
    removeActiveIfNeeded(lastRoute);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
