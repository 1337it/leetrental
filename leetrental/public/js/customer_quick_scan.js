(() => {
    const orig_make_quick_entry = frappe.ui.form.make_quick_entry;
    if (!orig_make_quick_entry || orig_make_quick_entry.__patched_for_customer_scan_v2) return;

    frappe.ui.form.make_quick_entry = async function(doctype, after_insert, init_callback, doc, force) {
      if (doctype !== "Customer") {
        return orig_make_quick_entry.apply(this, arguments);
      }

      // Dialog with two options
      const d = new frappe.ui.Dialog({
        title: __("New Customer"),
        fields: [
          { fieldtype: "Section Break", label: __("Choose method") },
          // Buttons row
          { fieldtype: "HTML", fieldname: "choice_ui" },
          { fieldtype: "Section Break" },

          // AUTO pane (hidden until chosen)
          { fieldtype: "HTML", fieldname: "auto_ui", depends_on: "eval:doc.__show_auto===1" },
          { fieldtype: "Data", fieldname: "file_url", hidden: 1 },
          { fieldtype: "Check", fieldname: "use_urlsource", label: __("Use urlSource (public URL)"), default: 0, depends_on: "eval:doc.__show_auto===1" },
          { fieldtype: "Check", fieldname: "debug", label: __("Debug log"), default: 0, depends_on: "eval:doc.__show_auto===1" },
        ],
        primary_action_label: __("Analyze & Create"),
        primary_action: async () => {
          const v = d.get_values();
          if (!v || !v.file_url) {
            frappe.msgprint(__("Please upload a document.")); 
            return;
          }
          try {
            frappe.dom.freeze(__("Analyzing…"));
            const c = await frappe.call({
              method: "leetrental.leetrental.azure_di.create_customer_from_scan",
              args: {
                file_url: v.file_url,
                use_urlsource: v.use_urlsource ? 1 : 0,
                set_docname_to_name: 1,
                debug: v.debug ? 1 : 0
              }
            });
            frappe.dom.unfreeze();
            const name = c.message && c.message.name;
            if (!name) throw new Error("Customer was not created.");
            d.hide();
            if (typeof after_insert === "function") after_insert(name);
            frappe.set_route("Form", "Customer", name);
          } catch (e) {
            frappe.dom.unfreeze();
            frappe.msgprint(__("Failed: {0}", [e.message || e]));
          }
        }
      });

      // Build the two big buttons
      const choice = d.get_field("choice_ui").$wrapper.get(0);
      choice.innerHTML = `
        <div class="flex gap-3" style="margin: 6px 0;">
          <button class="btn btn-primary" id="auto-reg">${__("Auto registration")}</button>
          <button class="btn btn-default" id="manual-reg">${__("Manual registration")}</button>
        </div>
      `;

      // Auto pane layout
      const autoWrap = d.get_field("auto_ui").$wrapper.get(0);
      autoWrap.innerHTML = `
        <div class="flex items-center gap-2" style="margin-top:10px;">
          <button class="btn btn-default" id="choose-file">${__("Upload document")}</button>
          <span id="chosen-file" class="text-muted"></span>
        </div>
        <div class="text-muted" style="margin-top:6px;">
          ${__("Accepted: JPG, PNG, PDF")}
        </div>
      `;

      // Hook up the two choices
      let showAuto = 0;
      const revealAuto = () => {
        showAuto = 1;
        d.set_value("__show_auto", 1); // drives depends_on
        d.set_primary_action_label(__("Analyze & Create"));
      };
      const goManual = () => {
        d.hide();
        // Open full form (bypasses quick entry)
        frappe.new_doc("Customer"); // full registration form
      };

      choice.querySelector("#auto-reg").addEventListener("click", revealAuto);
      choice.querySelector("#manual-reg").addEventListener("click", goManual);

      // Robust uploader for Auto
      autoWrap.querySelector("#choose-file").addEventListener("click", () => {
        new frappe.ui.FileUploader({
          allow_multiple: false,
          as_dataurl: false,
          restrictions: { allowed_file_types: [".jpg",".jpeg",".png",".pdf"] },
          on_success: (file_doc) => {
            d.set_value("file_url", file_doc.file_url);
            autoWrap.querySelector("#chosen-file").textContent =
              `${file_doc.file_name} (${file_doc.file_url})`;
            frappe.show_alert({ message: __("Uploaded"), indicator: "green" });
          }
        });
      });

      // Start with choice screen (primary disabled until Auto chosen
      d.set_primary_action(() => revealAuto()); // If user clicks primary without choosing, default to Auto
      d.show();
    };

    frappe.ui.form.make_quick_entry.__patched_for_customer_scan_v2 = true;
})();
