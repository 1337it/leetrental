// your_app/public/js/recents_page.js
frappe.provide('frappe.pages');                 // ensure namespace exists
frappe.pages['recents'] = frappe.pages['recents'] || {};  // create page object

frappe.pages['recents'].on_page_load = function (wrapper) {
  const page = frappe.ui.make_app_page({
    parent: wrapper,
    title: 'Recents',
    single_column: true
  });

  const $wrap = $(wrapper).find('.layout-main-section');
  $wrap.empty().append(`
    <div class="recents-controls" style="display:flex; gap:8px; align-items:center; margin-bottom:12px;">
      <input class="form-control" id="recents-search" placeholder="Search… (doctype, title, name)" style="max-width:320px;">
      <button class="btn btn-default btn-sm" id="recents-refresh">Refresh</button>
      <button class="btn btn-danger btn-sm" id="recents-clear">Clear All</button>
    </div>
    <div class="recents-table-wrapper">
      <table class="table table-hover" id="recents-table" style="margin-top:6px;">
        <thead>
          <tr>
            <th style="width:22%;">Doctype</th>
            <th style="width:38%;">Title</th>
            <th style="width:20%;">Name</th>
            <th style="width:12%;">Visited</th>
            <th style="width:8%;"></th>
          </tr>
        </thead>
        <tbody></tbody>
      </table>
    </div>
  `);

  const api = window.__RECENTS_API__;
  const $tbody = $wrap.find('#recents-table tbody');
  const $search = $wrap.find('#recents-search');

  function fmtTime(iso) {
    try {
      if (window.dayjs) return window.dayjs(iso).fromNow();
      const d = new Date(iso);
      return d.toLocaleString();
    } catch { return iso; }
  }

  function render() {
    const q = ($search.val() || '').toLowerCase().trim();
    const data = api ? api.load() : [];
    const rows = data
      .filter(x => !q || [x.doctype, x.title, x.name].some(s => (s || '').toLowerCase().includes(q)))
      .map(x => {
        const url = frappe.utils.get_form_link(x.doctype, x.name);
        return `
          <tr>
            <td>${frappe.utils.escape_html(x.doctype)}</td>
            <td><a href="${url}">${frappe.utils.escape_html(x.title || x.name)}</a></td>
            <td>${frappe.utils.escape_html(x.name)}</td>
            <td title="${x.visited_at}">${fmtTime(x.visited_at)}</td>
            <td style="white-space:nowrap;">
              <button class="btn btn-xs btn-default" data-act="open" data-url="${url}">Open</button>
              <button class="btn btn-xs btn-default" data-act="copy" data-url="${url}">Copy</button>
            </td>
          </tr>
        `;
      }).join('');

    $tbody.html(rows || `<tr><td colspan="5" class="text-muted">No recent documents yet.</td></tr>`);
  }

  $wrap.on('click', 'button[data-act="open"]', (e) => {
    const url = e.currentTarget.getAttribute('data-url');
    if (url) frappe.set_route(url.replace(/^#\//,''));
  });

  $wrap.on('click', 'button[data-act="copy"]', async (e) => {
    const url = location.origin + '/app/' + e.currentTarget.getAttribute('data-url').replace(/^#\/app\//,'');
    try { await navigator.clipboard.writeText(url); frappe.show_alert({ message: "Link copied", indicator: "green" }); }
    catch { frappe.msgprint(url); }
  });

  $wrap.find('#recents-refresh').on('click', render);
  $wrap.find('#recents-clear').on('click', () => {
    frappe.confirm('Clear all recent items?', () => {
      api && api.clear();
      render();
    });
  });

  $search.on('input', frappe.utils.debounce(render, 150));
  render();
};
