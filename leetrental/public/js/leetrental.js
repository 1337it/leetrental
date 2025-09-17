frappe.provide('leet.ws');

(function () {
  const HOST_ID = 'leet-ws-host';
  const PAGE_ID = 'page-Workspaces';

  // Ensure a fixed host container exists for the cloned Workspace
  function ensure_host() {
    let host = document.getElementById(HOST_ID);
    if (!host) {
      host = document.createElement('div');
      host.id = HOST_ID;
      host.setAttribute('aria-label', 'Workspace Sidebar');
      document.body.appendChild(host);
    }
    return host;
  }

  // Ask Frappe to preload the Workspaces page (without navigating)
  function load_workspace_page() {
    return new Promise((resolve) => {
      if (document.getElementById(PAGE_ID)) {
        return resolve();
      }
      // Frappe page loader (works in v14/v15)
      if (frappe.views && frappe.views.pageview && frappe.views.pageview.with_page) {
        frappe.views.pageview.with_page('Workspaces', () => resolve());
      } else {
        // Fallback: trigger a fetch via router (rarely needed)
        frappe.call('frappe.desk.reportview.get_count', {}).always(() => resolve());
      }
    });
  }

  // Clone the Workspace DOM tree and mount it into our fixed host
  function mount_cloned_workspace() {
    const source = document.getElementById(PAGE_ID);
    if (!source) return;

    const host = ensure_host();

    // mount once or refresh if empty
    if (!host.firstChild) {
      const clone = source.cloneNode(true);
      // prevent ID collision
      clone.id = `${PAGE_ID}-cloned`;
      host.appendChild(clone);
      document.body.classList.add('leet-ws-has');
    }
  }

  async function ensure_workspace_everywhere() {
    await load_workspace_page();
    mount_cloned_workspace();
  }

  // Run at boot and on every route change / hard refresh
  const start = () => ensure_workspace_everywhere();

  if (document.readyState !== 'loading') start();
  else document.addEventListener('DOMContentLoaded', start);

  // Keep it present across router changes
  if (frappe.router && frappe.router.on) {
    frappe.router.on('change', () => ensure_workspace_everywhere());
  }

  // In case ajax swaps parts of the DOM
  $(document).on('page-change', () => ensure_workspace_everywhere());
})();
