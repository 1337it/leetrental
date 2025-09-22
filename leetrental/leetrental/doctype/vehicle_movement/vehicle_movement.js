frappe.ui.form.on('Vehicle Movement', {
  refresh: function(frm) {
    // Collapse "In Details" by default
    frm.toggle_section('in_section', false);

    // If Movement Type is Workshop, show Workshop section
    frm.fields_dict["movement_subtype"].df.hidden = (frm.doc.movement_type !== "Workshop Movement");
    frm.fields_dict["service_done"].df.hidden = (frm.doc.movement_type !== "Workshop Movement");

    frm.refresh_field("movement_subtype");
    frm.refresh_field("service_done");
  },

  movement_type: function(frm) {
    if (frm.doc.movement_type === "Workshop Movement") {
      frm.toggle_display(["movement_subtype", "service_done"], true);
    } else {
      frm.toggle_display(["movement_subtype", "service_done"], false);
    }
  }
});
