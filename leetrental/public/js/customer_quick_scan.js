(() => {
    const orig_make_quick_entry = frappe.ui.form.make_quick_entry;
    if (orig_make_quick_entry.__patched_for_customer_scan) return;

    frappe.ui.form.make_quick_entry = async function(doctype, after_insert, init_callback, doc, force) {
      if (doctype !== "Customer") {
        return orig_make_quick_entry.apply(this, arguments);
      }

      // Custom Customer Quick Entry dialog
      const d = new frappe.ui.Dialog({
        title: __("Create Customer from Scan"),
        fields: [
          { fieldtype: "HTML", fieldname: "upload_ui" },
          { fieldtype: "Data", fieldname: "file_url", hidden: 1 },
          { fieldtype: "Check", fieldname: "use_urlsource", label: __("Use urlSource (public URL)") },
          { fieldtype: "Check", fieldname: "debug", label: __("Debug log") }
        ],
        primary_action_label: __("Analyze & Create"),
        primary_action: async () => {
          const v = d.get_values();
          if (!v || !v.file_url) {
            frappe.msgprint(__("Please upload a file first.")); 
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

      // Build uploader UI
      const wrapper = d.get_field("upload_ui").$wrapper.get(0);
      wrapper.innerHTML = `
        <div class="flex items-center gap-2">
          <button class="btn btn-default" id="choose-file">${__("Choose File")}</button>
          <span id="chosen-file" class="text-muted"></span>
        </div>
      `;
      wrapper.querySelector("#choose-file").addEventListener("click", () => {
        new frappe.ui.FileUploader({
          allow_multiple: false,
          as_dataurl: false,
          restrictions: { allowed_file_types: [".jpg",".jpeg",".png",".pdf"] },
          on_success: (file_doc) => {
            d.set_value("file_url", file_doc.file_url);
            wrapper.querySelector("#chosen-file").textContent =
              `${file_doc.file_name} (${file_doc.file_url})`;
            frappe.show_alert({ message: __("Uploaded"), indicator: "green" });
          }
        });
      });

      d.show();
    };

    frappe.ui.form.make_quick_entry.__patched_for_customer_scan = true;
})();
