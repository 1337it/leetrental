// Copyright (c) 2024, Leet Rental and contributors
// For license information, please see license.txt

frappe.ui.form.on('Insurance Policy', {
	refresh: function(frm) {
		// Set indicator based on expiration date
		if (frm.doc.end_date) {
			let today = frappe.datetime.get_today();
			let end_date = frm.doc.end_date;
			let days_diff = frappe.datetime.get_day_diff(end_date, today);
			
			if (days_diff < 0) {
				frm.dashboard.set_headline_alert(
					'Policy has expired on ' + frappe.datetime.str_to_user(end_date),
					'red'
				);
			} else if (days_diff <= 30) {
				frm.dashboard.set_headline_alert(
					'Policy expires in ' + days_diff + ' days',
					'red'
				);
			} else {
				frm.dashboard.set_headline_alert(
					'Policy is active',
					'green'
				);
			}
		}
		
		// Add button to renew policy
		if (frm.doc.docstatus === 1 && frm.doc.status === "Expiring Soon") {
			frm.add_custom_button(__('Renew Policy'), function() {
				frappe.model.open_mapped_doc({
					method: "leetrental.leetrental.doctype.insurance_policy.insurance_policy.make_renewal",
					frm: frm
				});
			});
		}
	},
	
	start_date: function(frm) {
		// Auto-set end_date to 1 year from start_date if not set
		if (frm.doc.start_date && !frm.doc.end_date) {
			let start = frappe.datetime.str_to_obj(frm.doc.start_date);
			let end = new Date(start.getFullYear() + 1, start.getMonth(), start.getDate());
			frm.set_value('end_date', frappe.datetime.obj_to_str(end));
		}
	},
	
	end_date: function(frm) {
		// Validate dates
		if (frm.doc.start_date && frm.doc.end_date) {
			if (frm.doc.end_date < frm.doc.start_date) {
				frappe.msgprint(__('End Date cannot be before Start Date'));
				frm.set_value('end_date', '');
			}
		}
	}
});

frappe.ui.form.on('Policy Attachment', {
	documents_add: function(frm, cdt, cdn) {
		// Set default values for new row
		let row = locals[cdt][cdn];
		row.upload_date = frappe.datetime.get_today();
	}
});