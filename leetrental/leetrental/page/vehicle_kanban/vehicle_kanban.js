
// leetrental/leetrental/page/vehicle_kanban/vehicle_kanban.js
frappe.provide("leetrental.vehicle_kanban");

frappe.pages["vehicle-kanban"] = {
  on_page_load(wrapper) {
    new leetrental.vehicle_kanban.Page(wrapper);
  },
};

leetrental.vehicle_kanban.Page = class {
  constructor(wrapper) {
    this.wrapper = $(wrapper);
    this.page = frappe.ui.make_app_page({
      parent: wrapper,
      title: "Vehicle Kanban",
      single_column: true,
    });

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

    this.make_toolbar();
    this.make_board();
    this.refresh();
  }

  make_toolbar() {
    this.page.set_primary_action(__("Refresh"), () => this.refresh());
    this.search = this.page.add_field({
      label: "Search",
      fieldtype: "Data",
      fieldname: "q",
      change: () => this.filter_cards(),
    });
  }

  make_board() {
    this.board = $(`<div class="kanban-board grid grid-cols-10 gap-3"></div>`).appendTo(this.page.main);
    this.columns = {};
    this.statuses.forEach((s) => {
      const col = $(`
        <div class="kanban-col border rounded">
          <div class="col-head p-2 fw-bold sticky-top bg-light">${frappe.utils.escape_html(s)}</div>
          <div class="col-body p-2" data-status="${frappe.utils.escape_html(s)}"></div>
        </div>
      `).appendTo(this.board);
      this.columns[s] = col.find(".col-body");
    });

    frappe.require("assets/frappe/js/lib/sortable.min.js", () => {
      this.statuses.forEach((s) => {
        new Sortable(this.columns[s].get(0), {
          group: "vehicles",
          animation: 120,
          onAdd: (evt) => this.on_drop(evt),
        });
      });
    });
  }

  async refresh() {
    const r = await frappe.call({ method: "leetrental.leetrental.page.vehicle_kanban.vehicle_kanban.fetch_vehicles" });
    this.all = r.message.vehicles || [];
    this.render();
  }

  render() {
    Object.values(this.columns).forEach((c) => c.empty());
    this.all.forEach((v) => {
      const card = $(this.card_html(v));
      card.data("vehicle", v);
      (this.columns[v.status] || this.columns["Available"]).append(card);
    });
  }

  filter_cards() {
    const q = (this.search.get_value() || "").toLowerCase();
    this.page.main.find(".kanban-card").each(function () {
      const text = $(this).text().toLowerCase();
      $(this).toggle(text.includes(q));
    });
  }

  card_html(v) {
    const title = v.license_plate || v.name;
    const subtitle = [v.make, v.model, v.year].filter(Boolean).join(" ");
    const meta = [
      v.current_agreement ? `Agr: ${frappe.utils.escape_html(v.current_agreement)}` : "",
      v.odometer ? `Odo: ${v.odometer}` : "",
    ].filter(Boolean).join(" • ");

    return `
      <div class="kanban-card card mb-2" draggable="true">
        <div class="card-body py-2 px-3">
          <div class="fw-bold">${frappe.utils.escape_html(title)}</div>
          <div class="text-muted small">${frappe.utils.escape_html(subtitle || "")}</div>
          ${meta ? `<div class="small mt-1">${meta}</div>` : ""}
        </div>
      </div>
    `;
  }

  async on_drop(evt) {
    const el = $(evt.item);
    const v = el.data("vehicle");
    const new_status = $(evt.to).data("status");
    if (!v || !new_status || v.status === new_status) return;

    const spec = this.dialog_for_transition(v.status, new_status, v);
    if (!spec) {
      await this.apply_transition(v, new_status, {});
      return;
    }

    const d = new frappe.ui.Dialog({
      title: spec.title,
      fields: spec.fields,
      primary_action_label: spec.action_label || __("Confirm"),
      primary_action: async (values) => {
        d.hide();
        // pass through as-is (server expects exact fieldnames)
        await this.apply_transition(v, new_status, values);
      },
    });

    if (spec.onload) spec.onload(d, v);
    d.show();
  }

  dialog_for_transition(from_status, to_status, v) {
    // Only include fields relevant to each transition.
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
          { fieldname: "out_notes", fieldtype: "Small Text", label: "Notes" },
        ],
      },
      "Reserved->Out for Delivery": {
        title: __("Dispatch Vehicle"),
        fields: [
          { fieldname: "out_date_time", fieldtype: "Datetime", label: "Dispatch Time", default: frappe.datetime.now_datetime(), reqd: 1 },
          { fieldname: "out_driver", fieldtype: "Link", options: "Employee", label: "Driver" },
          { fieldname: "out_staff", fieldtype: "Link", options: "Employee", label: "Staff" },
          { fieldname: "out_fuel_level", fieldtype: "Select", label: "Fuel Level (Out)", options: "\nEmpty\nQuarter\nHalf\nThree Quarters\nFull" },
          { fieldname: "out_mileage", fieldtype: "Int", label: "Odometer / Mileage (Out)" },
          { fieldname: "out_branch", fieldtype: "Link", options: "Branch", label: "Out Branch" },
          { fieldname: "out_from", fieldtype: "Small Text", label: "From Location" },
          { fieldname: "pickup_location", fieldtype: "Small Text", label: "Pickup Location" },
          { fieldname: "out_notes", fieldtype: "Small Text", label: "Notes" },
        ],
      },
      "Available->Rented Out": {
        title: __("Handover & Create Agreement"),
        fields: [
          { fieldname: "agreement_type", fieldtype: "Select", label: "Agreement Type", options: "Rental\nLeasing\nOther", default: "Rental" },
          { fieldname: "rent_rate", fieldtype: "Currency", label: "Rent Rate (per day)", reqd: 1 },
          { fieldname: "start_time", fieldtype: "Datetime", label: "Start Time", reqd: 1, default: frappe.datetime.now_datetime() },
          { fieldname: "end_time", fieldtype: "Datetime", label: "End Time", reqd: 1 },
          { fieldname: "out_date_time", fieldtype: "Datetime", label: "Handover Time", default: frappe.datetime.now_datetime(), reqd: 1 },
          { fieldname: "out_driver", fieldtype: "Link", options: "Employee", label: "Driver" },
          { fieldname: "out_staff", fieldtype: "Link", options: "Employee", label: "Staff" },
          { fieldname: "out_fuel_level", fieldtype: "Select", label: "Fuel Level (Out)", options: "\nEmpty\nQuarter\nHalf\nThree Quarters\nFull" },
          { fieldname: "out_mileage", fieldtype: "Int", label: "Odometer / Mileage (Out)" },
          { fieldname: "pickup_location", fieldtype: "Small Text", label: "Pickup Location" },
          { fieldname: "drop_location", fieldtype: "Small Text", label: "Drop Location" },
          { fieldname: "out_notes", fieldtype: "Small Text", label: "Notes" },
        ],
      },
      "Out for Delivery->Rented Out": {
        title: __("Confirm Handover"),
        fields: [
          { fieldname: "agreement_no", fieldtype: "Link", options: "Agreements", label: "Existing Agreement (optional)" },
          { fieldname: "out_date_time", fieldtype: "Datetime", label: "Handover Time", default: frappe.datetime.now_datetime(), reqd: 1 },
          { fieldname: "out_fuel_level", fieldtype: "Select", label: "Fuel Level (Out)", options: "\nEmpty\nQuarter\nHalf\nThree Quarters\nFull" },
          { fieldname: "out_mileage", fieldtype: "Int", label: "Odometer / Mileage (Out)" },
          { fieldname: "out_notes", fieldtype: "Small Text", label: "Notes" },
        ],
      },
      "Rented Out->Due for Return": {
        title: __("Mark Due for Return"),
        fields: [{ fieldname: "in_notes", fieldtype: "Small Text", label: "Notes/Reminder" }],
      },
      "Due for Return->Returned (Inspection)": {
        title: __("Check-in (Inspection)"),
        fields: [
          { fieldname: "in_date_time", fieldtype: "Datetime", label: "Return Time", default: frappe.datetime.now_datetime(), reqd: 1 },
          { fieldname: "in_fuel_level", fieldtype: "Select", label: "Fuel Level (In)", options: "\nEmpty\nQuarter\nHalf\nThree Quarters\nFull" },
          { fieldname: "in_mileage", fieldtype: "Int", label: "Odometer / Mileage (In)" },
          { fieldname: "in_branch", fieldtype: "Link", options: "Branch", label: "In Branch" },
          { fieldname: "in_to", fieldtype: "Small Text", label: "To Location" },
          { fieldname: "in_notes", fieldtype: "Small Text", label: "Notes" },
          { fieldname: "service_done", fieldtype: "Check", label: "Basic Service Done?" },
        ],
      },
      "Returned (Inspection)->Available": {
        title: __("Make Available"),
        fields: [
          { fieldname: "in_notes", fieldtype: "Small Text", label: "Notes" },
          { fieldname: "odometer_value", fieldtype: "Int", label: "Odometer (Update Vehicle)" },
        ],
      },
      "Returned (Inspection)->At Garage": {
        title: __("Send to Workshop"),
        fields: [
          { fieldname: "workshop", fieldtype: "Link", options: "Warehouse", label: "Workshop" },
          { fieldname: "in_date_time", fieldtype: "Datetime", label: "Send Time", default: frappe.datetime.now_datetime(), reqd: 1 },
          { fieldname: "in_to", fieldtype: "Small Text", label: "To Location" },
          { fieldname: "in_notes", fieldtype: "Small Text", label: "Issue/Notes", reqd: 1 },
        ],
      },
      "Available->At Garage": {
        title: __("Send to Workshop"),
        fields: [
          { fieldname: "workshop", fieldtype: "Link", options: "Warehouse", label: "Workshop" },
          { fieldname: "out_date_time", fieldtype: "Datetime", label: "Send Time", default: frappe.datetime.now_datetime(), reqd: 1 },
          { fieldname: "out_from", fieldtype: "Small Text", label: "From Location" },
          { fieldname: "out_notes", fieldtype: "Small Text", label: "Issue/Notes", reqd: 1 },
        ],
      },
    };

    const key = `${from_status}->${to_status}`;
    return M[key] || null;
  }

  async apply_transition(v, new_status, values) {
    try {
      frappe.dom.freeze(__("Updating…"));
      const r = await frappe.call({
        method: "leetrental.leetrental.page.vehicle_kanban.vehicle_kanban.transition_vehicle_status",
        args: {
          vehicle: v.name,
          from_status: v.status,
          to_status: new_status,
          payload: values, // server expects exact fieldnames; we kept them
        },
      });
      v.status = new_status;
      if (values.agreement_no) v.current_agreement = values.agreement_no;
      if (values.odometer_value) v.odometer = values.odometer_value;
      frappe.show_alert({ message: __("Moved to {0}", [new_status]), indicator: "green" });
    } catch (e) {
      console.error(e);
      frappe.msgprint({ title: __("Error"), message: e.message || e, indicator: "red" });
      await this.refresh();
    } finally {
      frappe.dom.unfreeze();
    }
  }
};
