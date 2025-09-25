(() => {
    const orig_make_quick_entry = frappe.ui.form.make_quick_entry;
    if (!orig_make_quick_entry || orig_make_quick_entry.__patched_customer_auto_manual) return;

    frappe.ui.form.make_quick_entry = function (doctype, after_insert, init_callback, doc, force) {
      if (doctype !== "Customer") {
        return orig_make_quick_entry.apply(this, arguments);
      }

      // Build dialog
      const d = new frappe.ui.Dialog({
        title: __("New Customer"),
        fields: [
          { fieldtype: "Section Break", label: __("Choose method") },
          { fieldtype: "HTML", fieldname: "choice_ui" },
          { fieldtype: "Section Break" },
          { fieldtype: "HTML", fieldname: "auto_ui" },     // we’ll toggle visibility manually
          { fieldtype: "Data", fieldname: "file_url", hidden: 1 },
          { fieldtype: "Check", fieldname: "use_urlsource", label: __("Use urlSource (public URL)") },
          { fieldtype: "Check", fieldname: "debug", label: __("Debug log") },
        ],
      });

      const choice = d.get_field("choice_ui").$wrapper.get(0);
      choice.innerHTML = `
        <div class="flex gap-3" style="margin:6px 0;">
          <button class="btn btn-primary" id="auto-reg">${__("Auto registration")}</button>
          <button class="btn btn-default" id="manual-reg">${__("Manual registration")}</button>
        </div>
      `;

      const autoWrap = d.get_field("auto_ui").$wrapper.get(0);
      autoWrap.innerHTML = `
        <div id="auto-pane" style="display:none; margin-top:10px;">
          <div class="flex items-center gap-2">
            <button class="btn btn-default" id="choose-file">${__("Upload document")}</button>
            <span id="chosen-file" class="text-muted"></span>
          </div>
          <div class="text-muted" style="margin-top:6px;">
            ${__("Accepted: JPG, PNG, PDF")}
          </div>
        </div>
      `;
      const autoPane = autoWrap.querySelector("#auto-pane");

      // Actions
      const startAuto = () => {
        autoPane.style.display = "";
        // swap primary to Analyze & Create
        d.set_primary_action(__("Analyze & Create"), async () => {
          const v = d.get_values();
          if (!v || !v.file_url) {
            frappe.msgprint(__("Please upload a document.")); 
            return;
          }
          try {
            frappe.dom.freeze(__("Analyzing…"));
            const r = await frappe.call({
              method: "leetrental.leetrental.azure_di.create_customer_from_scan",
              args: {
                file_url: v.file_url,
                use_urlsource: v.use_urlsource ? 1 : 0,
                set_docname_to_name: 1,
                debug: v.debug ? 1 : 0
              }
            });
            frappe.dom.unfreeze();
            const name = r.message && r.message.name;
            if (!name) throw new Error("Customer was not created.");
            d.hide();
            if (typeof after_insert === "function") after_insert(name);
            frappe.set_route("Form", "Customer", name);
          } catch (e) {
            frappe.dom.unfreeze();
            frappe.msgprint(__("Failed: {0}", [e.message || e]));
          }
        });
        d.get_primary_btn().text(__("Analyze & Create"));
      };

      const goManual = () => {
        d.hide();
        frappe.new_doc("Customer"); // open full form
      };

      // Wire buttons
      choice.querySelector("#auto-reg").addEventListener("click", startAuto);
      choice.querySelector("#manual-reg").addEventListener("click", goManual);

      // File uploader for Auto
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

      // Initial primary: default to Auto if clicked
      d.set_primary_action(__("Continue"), () => startAuto());
      d.get_primary_btn().text(__("Continue"));
      d.show();
    };

    frappe.ui.form.make_quick_entry.__patched_customer_auto_manual = true;
})();
