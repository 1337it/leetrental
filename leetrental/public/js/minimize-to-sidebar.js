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

  function currentFormKey() {
  const arr = getRouteArr();
  return (arr && arr[0] === 'Form' && arr[1] && arr[2]) ? arr.join('/') : '';
}

function pruneActiveDock() {
  if (!dock) return;
  const key = currentFormKey();
  if (!key) return;
  const el = dock.querySelector(`.minibtn[data-route="${CSS.escape(key)}"]`);
  if (el) el.remove();
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

  btn.draggable = true;
btn.addEventListener('dragstart', (ev) => {
  ev.dataTransfer.setData('text/plain', entry.key); // e.g. "Form/Doctype/NAME"
  ev.dataTransfer.effectAllowed = 'copy';
  console.debug('[mini-dock] dragstart', entry.key);
});

// global drop
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

     if (entry.key === currentFormKey()) return;
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

     pruneActiveDock();       // <-- NEW
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

   

  function wrapperEl(){
  return document.querySelector(
    '.layout-main-section-wrapper, .layout-main-section, .page-main, .page-content'
  );
}
function pageByRoute(routeStr){
  return document.querySelector(`.page-container[data-page-route="${CSS.escape(routeStr)}"]`);
}
function activePage(){
  // visible page OR route-resolved
  return pageByRoute(currentRouteStr()) || document.querySelector('.page-container:not([style*="display: none"])');
}
  
function currentRouteStr(){ return (getRouteArr()||[]).join('/'); }

function ensureSplitter(wrap){
  let split = wrap.querySelector('.splitter');
  if (!split){
    split = document.createElement('div');
    split.className = 'splitter';
  }
  return split;
}

function enableSplit(leftRoute, rightRoute){
  const wrap = wrapperEl(); if (!wrap) return;
  const left = pageByRoute(leftRoute) || activePage(); if (!left) return;
  const right = pageByRoute(rightRoute); if (!right) return;

  wrap.classList.add('is-split');
  // mark + force visible
  left.classList.add('split-left');  left.style.display = 'block';
  right.classList.add('split-right'); right.style.display = 'block';

  // put nodes in order: left (col 1), splitter (col 2), right (col 3)
  const split = ensureSplitter(wrap);
  if (left.parentElement !== wrap || left.nextElementSibling !== split || split.nextElementSibling !== right){
    wrap.insertBefore(left, wrap.firstChild);
    wrap.insertBefore(split, left.nextSibling);
    wrap.insertBefore(right, split.nextSibling);
  }

  // resizer
  let dragging=false, startX=0, startLeft=0;
  split.onmousedown = (e)=>{ dragging=true; startX=e.clientX; startLeft=left.getBoundingClientRect().width; e.preventDefault(); };
  window.addEventListener('mousemove', (e)=>{
    if(!dragging) return;
    const total = wrap.getBoundingClientRect().width;
    const newLeft = Math.min(Math.max(startLeft + (e.clientX - startX), 160), total-160);
    const l = newLeft/total, r = 1-l;
    wrap.style.setProperty('--left', `${l}fr`);
    wrap.style.setProperty('--right', `${r}fr`);
  });
  window.addEventListener('mouseup', ()=> dragging=false);

  ensureExitButton(wrap);
}

function exitSplit(){
  const wrap = wrapperEl(); if (!wrap) return;
  const left = wrap.querySelector('.page-container.split-left');
  const right = wrap.querySelector('.page-container.split-right');
  const split = wrap.querySelector('.splitter');
  const exit = wrap.querySelector('.split-exit');

  if (right){ right.style.display = 'none'; right.classList.remove('split-right'); }
  if (left){ left.classList.remove('split-left'); }
  if (split){ split.remove(); }
  if (exit){ exit.remove(); }

  wrap.classList.remove('is-split');
  wrap.style.removeProperty('--left');
  wrap.style.removeProperty('--right');
}

// Allow dropping a dock tab anywhere in content to split


// global drop
document.addEventListener('dragover', (e)=>{ e.preventDefault(); });
document.addEventListener('drop', (e)=>{
  const droppedRoute = e.dataTransfer?.getData('text/plain'); if (!droppedRoute) return;
  e.preventDefault();
  const leftRoute = currentRouteStr();
  if (!leftRoute || leftRoute === droppedRoute) return;
  enableSplit(leftRoute, droppedRoute);
});
  
  function init() {
  ensureDock();
  startObserver();
  placeDock();
 attachDrop();
  if (window.frappe?.router?.on) {
    window.frappe.router.on('change', onRouteChange);
  } else {
    window.addEventListener('hashchange', onRouteChange);
  }

  lastRoute = routeStr(getRouteArr());
  pruneActiveDock();

  // Manual tester
  window.__miniDockTestPin = () => {
    const e = parseFormEntry(getRouteArr());
    if (e) addToDock(e);
  };

  log('initialized');
} // <-- close init

// Boot once DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

  const DROP_ZONE_SEL = '.layout-main-section-wrapper, .layout-main-section, .page-main, .page-content';
function dropZone(){ return document.querySelector(DROP_ZONE_SEL) || document; }
})(); // <-- close IIFE
