// leetrental/public/js/vehicle_listview.js
frappe.listview_settings["Vehicle"] = {
  onload(listview) {
    listview.page.add_menu_item(__("Open Vehicle Kanban"), () => frappe.set_route("vehicle-kanban"));
  },
};
