// Copyright (c) 2024, Solufy and contributors
// For license information, please see license.txt

frappe.ui.form.on('Agreements', {
	refresh: function(frm) {
		// Add custom buttons or logic here
		if (frm.doc.docstatus === 1 && frm.doc.status === 'Active') {
			frm.add_custom_button(__('Complete Agreement'), function() {
				frappe.call({
					method: 'leetrental.leetrental.leetrental.doctype.agreements.agreements.complete_agreement',
					args: {
						agreement_name: frm.doc.name
					},
					callback: function(r) {
						if (!r.exc) {
							frappe.msgprint(__('Agreement completed successfully'));
							frm.reload_doc();
						}
					}
				});
			});
		}
	},
	
	rental_rate: function(frm) {
		calculate_totals(frm);
	},
	
	paid_amount: function(frm) {
		calculate_totals(frm);
	},
	
	start_date: function(frm) {
		calculate_totals(frm);
	},
	
	end_date: function(frm) {
		calculate_totals(frm);
	}
});

function calculate_totals(frm) {
	if (frm.doc.rental_rate && frm.doc.start_date && frm.doc.end_date) {
		let start = frappe.datetime.str_to_obj(frm.doc.start_date);
		let end = frappe.datetime.str_to_obj(frm.doc.end_date);
		let days = frappe.datetime.get_day_diff(end, start);
		
		let total = frm.doc.rental_rate * days;
		frm.set_value('total_amount', total);
		
		let balance = total - (frm.doc.paid_amount || 0);
		frm.set_value('balance_amount', balance);
	}
}