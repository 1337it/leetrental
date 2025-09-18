// assets/your_app/js/minimize-to-bottomdock.js
(() => {
  if (window.__MINIDOCK_BOTTOM_ACTIVE) return;
  window.__MINIDOCK_BOTTOM_ACTIVE = true;

  const MAX_ITEMS = 12; // you can raise this
  const HOST_SELECTOR = '.layout-main-section-wrapper';

  let dock = null;
  let observer = null;
  let lastRoute = '';
  let placeScheduled = false;

  const log = (...a) => console.debug('[mini-bottomdock]', ...a);

  // ---------- Helpers ----------
  const isVisible = el => !!(el && el.offsetParent !== null);
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

  function ensureSingleDockInDOM() {
    const all = document.querySelectorAll('#minimizedDock');
    if (all.length > 1) all.forEach((el, i) => i && el.remove());
    dock = all[0] || null;
  }

  function ensureDock() {
    ensureSingleDockInDOM();
    if (!dock) {
      dock = document.createElement('div');
      dock.id = 'minimizedDock';
      dock.className = 'bottomdock';        // floating dock style
      dock.setAttribute('data-minidock', '1');
    }
    return dock;
  }

  function getHost() {
    // Prefer the last visible wrapper in DOM order
    const nodes = [...document.querySelectorAll(HOST_SELECTOR)].filter(isVisible);
    return nodes.length ? nodes[nodes.length - 1] : null;
  }

  function placeDock() {
    ensureDock();
    const host = getHost();
    if (!host) {
      // If host not ready yet, keep dock detached to avoid overlaying body
      if (dock.parentElement) dock.parentElement.removeChild(dock);
      return;
    }

    // Ensure host is a positioning context
    host.classList.add('minidock-host'); // CSS sets position: relative

    // Already placed correctly?
    if (dock.parentElement !== host) {
      host.appendChild(dock);
      log('dock placed inside layout-main-section-wrapper');
    }
  }

  // ---------- Minimized Entry ----------
  function parseFormEntry(routeArr) {
    if (!routeArr || routeArr[0] !== 'Form') return null;
    const [, doctype, name] = routeArr;
    if (!doctype || !name) return null;
    return { doctype, docname: decodeURIComponent(name), key: routeArr.join('/'), route: routeArr };
  }

  function makeMiniButton(entry) {
    const btn = document.createElement('button');
    btn.className = 'minibtn';
    btn.type = 'button';
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
      // Navigate, but keep the dock as-is (persistent)
      if (window.frappe?.set_route) window.frappe.set_route(entry.route);
      else location.hash = '#' + entry.key;
    });

    return btn;
  }

  function addOrBump(entry) {
    ensureDock();
    // Add dock to host if possible
    placeDock();

    // De-dup by route key
    const existing = dock.querySelector(`.minibtn[data-route="${CSS.escape(entry.key)}"]`);
    if (existing) {
      // Move to front (leftmost)
      dock.prepend(existing);
    } else {
      dock.prepend(makeMiniButton(entry));
    }

    // Trim overflow
    [...dock.querySelectorAll('.minibtn')].slice(MAX_ITEMS).forEach(n => n.remove());

    // Update active state
    markActive(routeStr(getRouteArr()));
  }

  function markActive(currentStr) {
    const items = dock ? dock.querySelectorAll('.minibtn') : [];
    items.forEach(btn => {
      btn.classList.toggle('is-active', btn.dataset.route === currentStr);
    });
  }

  // ---------- Routing / Observing ----------
  function onRouteChange() {
    const nowArr = getRouteArr();
    const nowStr = routeStr(nowArr);

    // When leaving a Form/*, add/update its tab
    const prevArr = lastRoute ? lastRoute.split('/').map(decodeURIComponent) : null;
    if (prevArr && prevArr[0] === 'Form' && nowStr !== lastRoute) {
      const entry = parseFormEntry(prevArr);
      if (entry) addOrBump(entry);
    }

    // Keep active highlight even when opening the same tab
    markActive(nowStr);
    lastRoute = nowStr;

    debouncePlace(); // layouts may re-render after routing
  }

  function startObserver() {
    if (observer) return;
    observer = new MutationObserver(muts => {
      // Ignore self-mutations
      for (const m of muts) {
        if (dock && (m.target === dock || (m.target && dock.contains(m.target)))) continue;
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

    // Hook router
    if (window.frappe?.router?.on) window.frappe.router.on('change', onRouteChange);
    else window.addEventListener('hashchange', onRouteChange);

    lastRoute = routeStr(getRouteArr());
    markActive(lastRoute);

    // Manual tester
    window.__miniDockTestPin = () => {
      const e = parseFormEntry(getRouteArr());
      if (e) addOrBump(e);
    };

    log('initialized bottom dock');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
