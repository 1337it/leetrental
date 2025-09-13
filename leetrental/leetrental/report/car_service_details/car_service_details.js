// Copyright (c) 2022, Solufy and contributors
// For license information, please see license.txt
/* eslint-disable */

frappe.query_reports["Car Service Details"] = {
	"filters": [
		{
			"fieldname":"date",
			"label": __("Date"),
			"fieldtype": "Date",
			"reqd": 1,
			"default": frappe.datetime.add_months(frappe.datetime.get_today(), -1)
		},
		
		}
	],
	onload: function(report) {
		const views_menu = report.page.add_custom_button_group(__('Analysis Report'));
		report.page.add_custom_menu_item(views_menu, __("Car Service Details"), function() {
			frappe.set_route('query-report', 'Car Service Details');
		});
	}
};