(() => {
  if (window.__ADV_LINK_PICKER__) return; // singleton
  window.__ADV_LINK_PICKER__ = true;

class AdvancedLinkPicker {
  constructor({
    doctype,
    targetField,
    frm,
    columns = [],                    // ← [{key:'field', label:'Label', width:'30%', format:(v,row)=>...}]
    fetchFields = [],                // ← ['customer_name','mobile_no','status']
    staticFilters = {},
    makeNew = true,
    pageLen = 20
  }) {
    this.doctype = doctype;
    this.targetField = targetField;
    this.frm = frm;
    this.columns = columns.length ? columns : [
      { key: "value", label: "Name", width: "30%" },
      { key: "description", label: "Description", width: "40%" },
      { key: "owner", label: "Owner", width: "30%" },
    ];
    this.fetchFields = Array.from(new Set([
      "name",                         // always ensure 'name' is present
      ...columns.map(c => c.key),
      ...fetchFields
    ])).filter(Boolean);

    this.staticFilters = staticFilters;
    this.makeNew = makeNew;
    this.pageLen = pageLen;
    this.state = { txt: "", page: 0, rows: [], loading: false, hasMore: true, selIndex: -1, quickFilters: {} };

    this._buildDialog();
  }

  _buildDialog() {
    this.dlg = new frappe.ui.Dialog({
      title: `Select ${this.doctype}`,
      size: "large",
      primary_action_label: "Use Selection",
      primary_action: () => this._commitSelection(),
    });

    const $head = $(`
      <div class="flex items-center gap-2" style="margin-bottom:8px">
        <input type="text" class="form-control" placeholder="Search ${this.doctype}… (min 2 chars)">
        <div class="quick-filters flex gap-2"></div>
        <button class="btn btn-default btn-xs reset-filters">Reset</button>
      </div>
    `);
    this.$search = $head.find("input");

    const colHeads = this.columns.map(c => `<th style="width:${c.width || 'auto'}">${c.label || c.key}</th>`).join("");
    const $table = $(`
      <div class="advanced-link-results" style="max-height:50vh; overflow:auto; border:1px solid var(--border-color,#e5e7eb); border-radius:6px;">
        <table class="table table-hover" style="margin:0">
          <thead><tr>${colHeads}</tr></thead>
          <tbody></tbody>
        </table>
        <div class="text-center" style="padding:8px">
          <button class="btn btn-default btn-sm load-more">Load more</button>
        </div>
      </div>
    `);
    this.$tbody = $table.find("tbody");

    const $foot = $(`
      <div class="flex items-center justify-between" style="margin-top:8px">
        <div class="hint text-muted small">Tip: ↑/↓ to navigate, Enter to select, Esc to close</div>
        <button class="btn btn-primary btn-sm create-new">Create New ${this.doctype}</button>
      </div>
    `);

    this.dlg.$body.append($head, $table, $foot);

    let debTimer = null;
    this.$search.on("input", () => {
      clearTimeout(debTimer);
      debTimer = setTimeout(() => this._freshSearch(), 200);
    });
    this.dlg.$body.on("click", ".load-more", () => this._load());
    this.dlg.$body.on("click", "tbody tr", (e) => {
      const idx = Number($(e.currentTarget).attr("data-idx"));
      this._setActive(idx);
      this._commitSelection();
    });
    this.dlg.$wrapper.on("keydown", (e) => this._onKey(e));
    this.dlg.$body.find(".reset-filters").on("click", () => {
      this.state.quickFilters = {};
      this.$search.val("");
      this._freshSearch();
    });
    $foot.find(".create-new").on("click", () => this._createNew());
  }

  open(prefill = "") {
    this.$search.val(prefill || "");
    this.state = { ...this.state, txt: prefill || "", page: 0, rows: [], hasMore: true, selIndex: -1 };
    this._renderRows();
    this.dlg.show();
    setTimeout(() => this.$search.trigger("focus"), 0); // auto-focus
    this._load(); // initial
  }

  _freshSearch() {
    this.state.txt = this.$search.val().trim();
    this.state.page = 0;
    this.state.rows = [];
    this.state.hasMore = true;
    this.state.selIndex = -1;
    this._renderRows();
    this._load();
  }

  async _load() {
    if (this.state.loading || !this.state.hasMore) return;
    this.state.loading = true;
    const pageStart = this.state.page * this.pageLen;

    try {
      // Step 1: get base hits (names) via built-in search
      const { message } = await frappe.call({
        method: "frappe.desk.search.search_link",
        args: {
          doctype: this.doctype,
          txt: this.state.txt || "",
          page_length: this.pageLen,
          start: pageStart,
          filters: { ...this.staticFilters, ...this.state.quickFilters },
        },
      });

      const baseRows = (message || []);
      const names = baseRows.map(r => r.value).filter(Boolean);

      // Step 2: fetch your requested fields in one go
      let enrichedByName = {};
      if (names.length) {
        const { message: details } = await frappe.call({
          method: "frappe.client.get_list",
          args: {
            doctype: this.doctype,
            fields: this.fetchFields,
            filters: [["name", "in", names]],
            limit_page_length: this.pageLen,
          },
        });
        // index by name for quick merge
        for (const d of (details || [])) enrichedByName[d.name] = d;
      }

      // Step 3: merge → single row object with all keys you asked for
      const rows = baseRows.map(r => {
        const extra = enrichedByName[r.value] || {};
        return { value: r.value, description: r.description, owner: r.owner, ...extra };
      });

      this.state.rows.push(...rows);
      this.state.hasMore = (baseRows.length === this.pageLen);
      this.state.page += 1;
      if (this.state.selIndex === -1 && this.state.rows.length) this.state.selIndex = 0;
      this._renderRows();
    } catch (e) {
      frappe.msgprint({ title: "Search failed", message: e.message || e, indicator: "red" });
      this.state.hasMore = false;
    } finally {
      this.state.loading = false;
    }
  }

  _renderRows() {
    this.$tbody.empty();
    if (!this.state.rows.length) {
      this.$tbody.append(`<tr><td colspan="${this.columns.length}" class="text-muted">No results</td></tr>`);
      return;
    }
    this.state.rows.forEach((row, idx) => {
      const tds = this.columns.map(c => {
        const raw = row[c.key];
        const val = c.format ? c.format(raw, row) : raw;
        return `<td>${frappe.utils.escape_html(val ?? "")}</td>`;
      }).join("");
      const tr = $(`<tr data-idx="${idx}" class="${idx === this.state.selIndex ? "active" : ""}">${tds}</tr>`);
      this.$tbody.append(tr);
    });
    this.$tbody.closest(".advanced-link-results").find(".load-more")
      .prop("disabled", !this.state.hasMore)
      .text(this.state.hasMore ? "Load more" : "No more");
  }

  _onKey(e) {
    if (!this.dlg.is_visible) return;
    const max = this.state.rows.length - 1;
    if (e.key === "ArrowDown") {
      e.preventDefault(); if (max >= 0) this._setActive(Math.min(this.state.selIndex + 1, max));
    } else if (e.key === "ArrowUp") {
      e.preventDefault(); if (max >= 0) this._setActive(Math.max(this.state.selIndex - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault(); this._commitSelection();
    }
  }

  _setActive(idx) {
    this.state.selIndex = idx;
    this.$tbody.children("tr").removeClass("active");
    this.$tbody.children(`tr[data-idx="${idx}"]`).addClass("active")[0]?.scrollIntoView({ block: "nearest" });
  }

  _commitSelection() {
    const row = this.state.rows[this.state.selIndex];
    if (!row) return;
    if (this.frm && this.targetField) this.frm.set_value(this.targetField, row.value);
    this.dlg.hide();
  }

  _createNew() {
    this.dlg.hide();
    frappe.new_doc(this.doctype, (doc) => {
      if (this.frm && this.targetField) {
        const afterSave = () => {
          this.frm.set_value(this.targetField, doc.name);
          cur_frm?.off?.("after_save", afterSave);
        };
        cur_frm?.on?.("after_save", afterSave);
      }
    });
  }
}

  // Expose global helper
  window.openAdvancedLinkPicker = function(opts) {
    const picker = new AdvancedLinkPicker(opts);
    picker.open();
    return picker;
  };
})();
