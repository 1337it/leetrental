frappe.listview_settings['Vehicle'] = {
  get_indicator(doc) {
    const COLORS = {
      "Available": "green",
      "Reserved": "orange",
      "Out for Delivery": "blue",
      "Rented Out": "blue",
      "Due for Return": "orange",
      "Custody": "gray",
      "At Garage": "orange",
      "Under Maintenance": "red",
      "Accident/Repair": "red",
      "Deactivated": "darkgrey"
    };
    const color = COLORS[doc.status] || "gray";
    return [doc.status, color, "status,=," + doc.status];
  }
};
