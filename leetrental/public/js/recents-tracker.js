(() => {
  if (window.__RECENTS_TRACKER_ACTIVE__) return;
  window.__RECENTS_TRACKER_ACTIVE__ = true;

  const STORAGE_KEY = "recents:v1";
  const LIMIT = 50;

  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]"); }
    catch { return []; }
  }

  function save(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list.slice(0, LIMIT)));
  }

  function pushRecent(item) {
    const list = load();
    const key = `${item.doctype}:::${item.name}`;
    const filtered = list.filter(x => `${x.doctype}:::${x.name}` !== key);
    filtered.unshift(item);
    save(filtered);
  }

  // Hook route changes
  frappe.after_ajax && frappe.after_ajax(() => {
    // initial route capture
    captureRoute();

    // capture on every route change
    frappe.router.on("change", () => {
      captureRoute();
    });
  });

  async function captureRoute() {
    const r = frappe.get_route(); // e.g. ["Form","Sales Invoice","SINV-0001"]
    if (!r || r[0] !== "Form" || !r[1] || !r[2]) return;

    const doctype = r[1];
    const name = r[2];

    // Try to get a human title (fallback to name)
    let title = name;
    try {
      const meta = frappe.get_meta(doctype);
      const title_field = (meta && meta.title_field) || "title";
      const fields = [title_field, "modified", "owner"];
      // If doc is in cache, read; else fetch just title_field
      let doc = locals[doctype] && locals[doctype][name];
      if (!doc) {
        const res = await frappe.db.get_value(doctype, name, fields);
        doc = res && res.message || {};
      }
      title = (doc[title_field] || name);
    } catch (e) {
      // ignore
    }

    pushRecent({
      doctype,
      name,
      title,
      visited_at: new Date().toISOString()
    });
  }

  // Expose small API for the Recents page
  window.__RECENTS_API__ = {
    load,
    save,
    clear() { localStorage.removeItem(STORAGE_KEY); },
  };
})();
