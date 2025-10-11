// Copyright (c) 2024, LeetRental and contributors
// For license information, please see license.txt

frappe.listview_settings['Vehicles'] = {
	add_fields: ['license_plate', 'model', 'driver', 'workflow_state', 'custom_insurance_valid_till'],
	
	get_indicator: function(doc) {
		// Color indicators based on status
		if (doc.workflow_state) {
			const status_colors = {
				'Active': 'green',
				'Inactive': 'red',
				'Maintenance': 'orange',
				'Reserved': 'blue'
			};
			return [__(doc.workflow_state), status_colors[doc.workflow_state] || 'gray', 'workflow_state,=,' + doc.workflow_state];
		}
		
		// Check insurance expiry
		if (doc.custom_insurance_valid_till) {
			let today = frappe.datetime.get_today();
			let days_diff = frappe.datetime.get_day_diff(doc.custom_insurance_valid_till, today);
			
			if (days_diff < 0) {
				return [__('Insurance Expired'), 'red', 'custom_insurance_valid_till,<,Today'];
			} else if (days_diff < 30) {
				return [__('Insurance Expiring'), 'orange', 'custom_insurance_valid_till,<,Today + 30'];
			}
		}
		
		return [__('Active'), 'green', 'workflow_state,=,Active'];
	},
	
	onload: function(listview) {
		// Add custom filters
		listview.page.add_inner_button(__('Available Vehicles'), function() {
			listview.filter_area.add([[listview.doctype, 'driver', 'is', 'not set']]);
		});
		
		listview.page.add_inner_button(__('Assigned Vehicles'), function() {
			listview.filter_area.add([[listview.doctype, 'driver', 'is', 'set']]);
		});
		
		listview.page.add_inner_button(__('Expiring Insurance'), function() {
			let thirty_days = frappe.datetime.add_days(frappe.datetime.get_today(), 30);
			listview.filter_area.add([
				[listview.doctype, 'custom_insurance_valid_till', '<=', thirty_days]
			]);
		});
	}
};