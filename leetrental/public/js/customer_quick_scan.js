frappe.provide("frappe.ui.form");

// Keep a reference to the original class
const _QuickEntryForm = frappe.ui.form.QuickEntryForm;

// Override only for Customer
frappe.ui.form.QuickEntryForm = class QuickEntryFormPatched extends _QuickEntryForm {
  constructor(doctype, after_insert, init_callback, doc) {
    super(doctype, after_insert, init_callback, doc);
    this.__is_customer_quick = (doctype === "Customer");
  }

  // Build a custom dialog for Customer quick entry
  make() {
    if (!this.__is_customer_quick) {
      return super.make();
    }

    // Minimal dialog
    this.dialog = new frappe.ui.Dialog({
      title: __("Create Customer from Scan"),
      fields: [
        { fieldtype: "Section Break" },
        { fieldtype: "Attach", fieldname: "file", label: __("Image/PDF"), reqd: 1 },
        { fieldtype: "Check", fieldname: "use_urlsource", label: __("Use urlSource (public URL)") },
        { fieldtype: "Check", fieldname: "debug", label: __("Debug log") },
      ],
      primary_action_label: __("Analyze & Create"),
      primary_action: () => this._analyze_and_create()
    });

    this.dialog.show();
  }

  // Skip default Quick Entry behaviors
  setup() { if (!this.__is_customer_quick) return super.setup(); }
  render_dialog() { if (!this.__is_customer_quick) return super.render_dialog(); }
  is_valid() { if (!this.__is_customer_quick) return super.is_valid(); return true; }

  async _analyze_and_create() {
    const v = this.dialog.get_values();
    if (!v || !v.file) {
      frappe.msgprint(__("Please attach an image or PDF.")); return;
    }

    try {
      frappe.dom.freeze(__("Analyzing…"));

      // 1) Analyze-only to get fields + doc_type and assign attach/image fields
      const r = await frappe.call({
        method: "leetrental.leetrental.azure_di.analyze_scan", // make sure this dotted path matches your app/module
        args: {
          file_url: v.file,
          use_urlsource: v.use_urlsource ? 1 : 0,
          debug: v.debug ? 1 : 0
        }
      });

      const out = r.message || {};
      const f = out.fields || {};

      // 2) Build a new Customer on server using create_from_scan (ensures DB save)
      // If you already have create_customer_from_scan, call that directly.
      const c = await frappe.call({
        method: "leetrental.leetrental.azure_di.create_customer_from_scan",
        args: {
          file_url: f.attach_passport || f.attach_license || f.attach_id || v.file,
          use_urlsource: v.use_urlsource ? 1 : 0,
          set_docname_to_name: 1,   // optional: make docname = extracted name if you enabled autoname via field
          debug: v.debug ? 1 : 0
        }
      });

      const name = c.message && c.message.name;
      if (!name) {
        throw new Error("Customer was not created. Check server logs.");
      }

      frappe.show_alert({ message: __("Created: {0}", [name]), indicator: "green" });
      this.dialog.hide();
      frappe.dom.unfreeze();

      // Route to the created Customer
      frappe.set_route("Form", "Customer", name);

    } catch (e) {
      frappe.dom.unfreeze();
      frappe.msgprint(__("Failed: {0}", [e.message || e]));
    }
  }
};
