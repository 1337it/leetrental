frappe.ready(() => {
  const addBtn = () => {
    const bar = document.querySelector('.navbar .navbar-nav');
    if (!bar || document.querySelector('#recents-topbar-btn')) return;
    const li = document.createElement('li');
    li.className = 'nav-item';
    li.innerHTML = `<a id="recents-topbar-btn" class="nav-link" href="#/app/recents" title="Recents">Recents</a>`;
    bar.appendChild(li);
  };
  addBtn();
  // In case header re-renders
  const obs = new MutationObserver(addBtn);
  obs.observe(document.body, { childList: true, subtree: true });
});
