// assets/your_app/js/minimize-to-sidebar.js
(() => {
  const MAX_ITEMS = 6;
  const SIDEBAR_SELECTORS = [
    '.sidebar',                 // your custom global sidebar
    '.desk-sidebar',            // Frappe desk
    '.standard-sidebar',        // some pages
    '.page-sidebar',            // reports/pages
    '.layout-side-section'      // form layout sidebar
  ];

  const LOG = (...a) => console.debug('[mini-dock]', ...a);

  function findSidebar() {
    for (const sel of SIDEBAR_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) { LOG('sidebar found via', sel); return el; }
    }
    LOG('no sidebar found; using fallback dock');
    return null;
  }

  function ensureDock() {
    // prefer attaching to an existing sidebar
    const host = findSidebar();
    let dock = (host || document.body).querySelector('#minimizedDock');

    if (!dock) {
      dock = document.createElement('div');
      dock.id = 'minimizedDock';
      dock.className = host ? 'sidebar__minimized' : 'fallback__minimized';
      (host || document.body).appendChild(dock);
    }
    return dock;
  }

  function routeStrOf(arr) { return (arr || []).join('/'); }

  function getRouteArr() {
    try { return window.frappe?.get_route ? window.frappe.get_route() : (location.hash || '').replace(/^#/, '').split('/'); }
    catch { return []; }
  }

  function parseFormTitle(routeArr) {
    if (!routeArr || routeArr[0] !== 'Form') return null;
    const [, doctype, name] = routeArr;
    if (!doctype || !name) return null;
    const docname = decodeURIComponent(name);
    return {
      label: `${doctype}: ${docname}`,
      icon: '📄',
      key: routeArr.join('/'),
      route: routeArr
    };
  }

  function makeMiniButton(entry) {
    const btn = document.createElement('div');
    btn.className = 'minibtn';
    btn.setAttribute('data-route', entry.key);

    const icon = document.createElement('div'); icon.className = 'minibtn__icon'; icon.textContent = entry.icon;
    const label = document.createElement('div'); label.className = 'minibtn__label'; label.textContent = entry.label;
    const close = document.createElement('button'); close.className = 'minibtn__close'; close.title = 'Remove'; close.textContent = '×';
    close.addEventListener('click', (e) => { e.stopPropagation(); btn.remove(); });

    btn.append(icon, label, close);
    btn.addEventListener('click', () => {
      LOG('restore route', entry.route);
      if (window.frappe?.set_route) window.frappe.set_route(entry.route);
      else location.hash = '#' + entry.key;
    });
    return btn;
  }

  function addToDock(entry) {
    const dock = ensureDock();
    const sel = `.minibtn[data-route="${CSS.escape(entry.key)}"]`;
    const existing = dock.querySelector(sel);
    if (existing) { dock.prepend(existing); return; }
    const btn = makeMiniButton(entry);
    dock.prepend(btn);
    [...dock.querySelectorAll('.minibtn')].slice(MAX_ITEMS).forEach(n => n.remove());
  }

  // Manual pin (for testing on demand)
  function pinCurrentIfForm() {
    const arr = getRouteArr();
    const entry = parseFormTitle(arr);
    if (entry) { LOG('pin current form', entry.key); addToDock(entry); }
    else LOG('current route is not a Form/*', arr);
  }

  // Route tracking
  let last = routeStrOf(getRouteArr());

  function handleRouteChange() {
    const nowArr = getRouteArr();
    const nowStr = routeStrOf(nowArr);
    LOG('route change', { from: last, to: nowStr });

    // minimize the previous Form/* when leaving it
    const prevArr = last ? last.split('/').map(decodeURIComponent) : null;
    if (prevArr && prevArr[0] === 'Form' && nowStr !== last) {
      const entry = parseFormTitle(prevArr);
      if (entry) addToDock(entry);
    }
    last = nowStr;
  }

  function attach() {
    ensureDock();

    // expose a quick tester in console
    window.__miniDockTestPin = pinCurrentIfForm;

    if (window.frappe?.router?.on) {
      window.frappe.router.on('change', handleRouteChange);
      LOG('attached to frappe.router change');
    } else {
      window.addEventListener('hashchange', handleRouteChange);
      LOG('attached to hashchange');
    }

    // initialize
    last = routeStrOf(getRouteArr());
    LOG('initialized; current route =', last);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', attach);
  else attach();
})();
