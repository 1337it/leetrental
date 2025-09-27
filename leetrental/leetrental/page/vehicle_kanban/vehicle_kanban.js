// leetrental/leetrental/leetrental/page/vehicle_kanban/vehicle_kanban.js
frappe.provide("leetrental.vehicle_kanban");

frappe.pages["vehicle-kanban"] = {
  on_page_load(wrapper) {
    // Guard: make sure frappe.ui.make_app_page exists
    if (!frappe.ui || !frappe.ui.make_app_page) {
      console.error("[Vehicle Kanban] frappe.ui.make_app_page missing");
      frappe.msgprint(__("Frappe UI not ready. Try reload (Ctrl+Shift+R)."));
      return;
    }
    new leetrental.vehicle_kanban.Page(wrapper);
  },
};

leetrental.vehicle_kanban.Page = class {
  constructor(wrapper) {
    this.wrapper = $(wrapper);
    this.page = frappe.ui.make_app_page({
      parent: wrapper,
      title: __("Vehicle Kanban"),
      single_column: true,
    });

    // Columns (keep in sync with server transitions)
    this.statuses = [
      "Available",
      "Reserved",
      "Out for Delivery",
      "Rented Out",
      "Due for Return",
      "Returned (Inspection)",
      "At Garage",
      "Under Maintenance",
      "Accident/Repair",
      "Deactivated",
    ];

    this._init_toolbar();
    this._init_board();
    this._load_sortable().then(() => this.refresh());
  }

  _init_toolbar() {
    this.page.set_primary_action(__("Refresh"), () => this.refresh());
    this.search = this.page.add_field({
      label: __("Search"),
      fieldtype: "Data",
      fieldname: "q",
      change: () => this._filter_cards(),
    });
  }

  _init_board() {
    this.board = $(`<div class="kanban-board" style="display:grid;grid-template-columns:repeat(${this.statuses.length}, minmax(260px,1fr));gap:12px;"></div>`);
    this.page.main.empty().append(this.board);
    this.columns = {};

    this.statuses.forEach((s) => {
      const col = $(`
        <div class="kanban-col" style="border:1px solid var(--border-color, #ddd);border-radius:8px;overflow:hidden;">
          <div class="col-head" style="position:sticky;top:0;background:var(--bg-color, #f7f7f7);padding:8px 10px;font-weight:600;">${frappe.utils.escape_html(s)}</div>
          <div class="col-body" data-status="${frappe.utils.escape_html(s)}" style="padding:8px;min-height:60vh;"></div>
        </div>
      `);
      this.board.append(col);
      this.columns[s] = col.find(".col-body");
    });
  }

  async _load_sortable() {
    // Frappe v15 path
    const path = "/assets/frappe/node_modules/sortablejs/Sortable.min.js";
    try {
      await new Promise((resolve, reject) => {
        frappe.require([path], resolve);
        setTimeout(() => reject(new Error("Timeout loading Sortable")), 8000);
      });
      if (!window.Sortable) {
        throw new Error("Sortable loaded but window.Sortable missing");
      }
      // Init after Sortable present
      this.statuses.forEach((s) => {
        new Sortable(this.columns[s].get(0), {
          group: "vehicles",
          animation: 120,
          onAdd: (evt) => this._on_drop(evt),
        });
      });
    } catch (e) {
      console.error("[Vehicle Kanban] Failed to load Sortable:", e);
      frappe.msgprint({
        title: __("Asset Load Error"),
        message: __("Could not load Sortable.js. Check network or asset path."),
        indicator: "red",
      });
    }
  }

  async refresh() {
    try {
      const r = await frappe.call({
        method: "leetrental.leetrental.leetrental.page.vehicle_kanban.vehicle_kanban.fetch_vehicles",
      });
      this.all = (r.message && r.message.vehicles) || [];
      this._render();
    } catch (e) {
      console.error("[Vehicle Kanban] fetch_vehicles failed:", e);
      frappe.msgprint({ title: __("Error"), message: e.message || e, indicator: "red" });
    }
  }

  _render() {
    Object.values(this.columns).forEach((c) => c.empty());

    if (!this.all.length) {
      // Show a friendly empty state at least
      this.columns[this.statuses[0]].append(
        `<div class="text-muted" style="padding:8px;">${__("No vehicles found.")}</div>`
      );
      return;
    }

    this.all.forEach((v) => {
      const card = $(this._card_html(v));
      card.data("vehicle", v);
      (this.columns[v.status] || this.columns["Available"]).append(card);
    });
  }

  _filter_cards() {
    const q = (this.search.get_value() || "").toLowerCase();
    this.page.main.find(".kanban-card").each(function () {
      const text = $(this).text().toLowerCase();
      $(this).toggle(text.includes(q));
    });
  }

  _card_html(v) {
    const title = v.license_plate || v.name;
    const subtitle = [v.make, v.model, v.year].filter(Boolean).join(" ");
    const meta = [
      v.current_agreement ? `Agr: ${frappe.utils.escape_html(v.current_agreement)}` : "",
      v.odometer ? `Odo: ${v.odometer}` : "",
    ]
      .filter(Boolean)
      .join(" • ");

    return `
      <div class="kanban-card card" draggable="true" style="margin-bottom:8px;">
        <div class="card-body" style="padding:10px 12px;">
          <div class="fw-bold">${frappe.utils.escape_html(title)}</div>
          <div class="text-muted small">${frappe.utils.escape_html(subtitle || "")}</div>
          ${meta ? `<div class="small mt-1">${meta}</div>` : ""}
        </div>
      </div>
    `;
  }

  async _on_drop(evt) {
    const el = $(evt.item);
    const v = el.data("vehicle");
    const new_status = $(evt.to).data("status");
    if (!v || !new_status || v.status === new_status) return;

    const spec = this._dialog_for_transition(v.status, new_status, v);
    if (!spec) {
      await this._apply_transition(v, new_status, {});
      return;
    }

    const d = new frappe.ui.Dialog({
      title: spec.title,
      fields: spec.fields,
      primary_action_label: spec.action_label || __("Confirm"),
      primary_action: async (values) => {
        d.hide();
        await this._apply_transition(v, new_status, values);
      },
    });

    if (spec.onload) spec.onload(d, v);
    d.show();
  }

  _dialog_for_transition(from_status, to_status, v) {
    // Same dialog spec from previous message (trimmed for brevity).
    // Keep exact fieldnames to match your doctypes.
    const M = {
      "Available->Reserved": {
        title: __("Reserve Vehicle"),
        fields: [
          { fieldname: "agreement_type", fieldtype: "Select", label: "Agreement Type", options: "Rental\nLeasing\nOther", default: "Rental" },
          { fieldname: "rent_rate", fieldtype: "Currency", label: "Rent Rate (per day)" },
          { fieldname: "start_time", fieldtype: "Datetime", label: "Start Time", reqd: 1, default: frappe.datetime.now_datetime() },
          { fieldname: "end_time", fieldtype: "Datetime", label: "End Time", reqd: 1 },
          { fieldname: "pickup_location", fieldtype: "Small Text", label: "Pickup Location" },
          { fieldname: "drop_location", fieldtype: "Small Text", label: "Drop Location" },
          { fieldname: "out_notes", fieldtype: "Small Text", label: "Notes" }
        ],
      },
      // ... (keep the rest of the matrix unchanged from previous reply)
    };
    const key = `${from_status}->${to_status}`;
    return M[key] || null;
  }

  async _apply_transition(v, new_status, values) {
    try {
      frappe.dom.freeze(__("Updating…"));
      const r = await frappe.call({
        method: "leetrental.leetrental.leetrental.page.vehicle_kanban.vehicle_kanban.transition_vehicle_status",
        args: {
          vehicle: v.name,
          from_status: v.status,
          to_status: new_status,
          payload: values,
        },
      });
      v.status = new_status;
      if (values.agreement_no) v.current_agreement = values.agreement_no;
      if (values.odometer_value) v.odometer = values.odometer_value;
      frappe.show_alert({ message: __("Moved to {0}", [new_status]), indicator: "green" });
    } catch (e) {
      console.error("[Vehicle Kanban] transition failed:", e);
      frappe.msgprint({ title: __("Error"), message: e.message || e, indicator: "red" });
      await this.refresh();
    } finally {
      frappe.dom.unfreeze();
    }
  }
};
