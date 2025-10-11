// Copyright (c) 2024, Frappe Technologies and contributors
// For license information, please see license.txt

frappe.ui.form.on('Vehicle Movements', {
	refresh: function(frm) {
		// Add custom buttons for workshop movements
		if (frm.doc.movement_type === 'Workshop' && frm.doc.docstatus === 1) {
			if (frm.doc.workshop_status !== 'Completed') {
				frm.add_custom_button(__('Mark as Completed'), function() {
					mark_workshop_completed(frm);
				});
			}
			
			frm.add_custom_button(__('Update Workshop Status'), function() {
				update_workshop_status(frm);
			});
		}
		
		// Show workshop summary
		if (frm.doc.movement_type === 'Workshop' && frm.doc.docstatus === 1) {
			show_workshop_summary(frm);
		}
	},
	
	movement_type: function(frm) {
		if (frm.doc.movement_type === 'Workshop') {
			// Load workshop settings and auto-populate
			load_workshop_settings(frm);
			
			// Set default values
			if (!frm.doc.workshop_status) {
				frm.set_value('workshop_status', 'Pending');
			}
		}
	},
	
	vehicle: function(frm) {
		if (frm.doc.vehicle && frm.doc.movement_type === 'Workshop') {
			// Get last odometer reading
			get_last_odometer_reading(frm);
		}
	},
	
	workshop_status: function(frm) {
		if (frm.doc.workshop_status === 'Completed' && !frm.doc.actual_completion_date) {
			frm.set_value('actual_completion_date', frappe.datetime.get_today());
		}
	}
});

function load_workshop_settings(frm) {
	frappe.call({
		method: 'frappe.client.get',
		args: {
			doctype: 'Workshop Settings',
			name: 'Workshop Settings'
		},
		callback: function(r) {
			if (r.message) {
				// Auto-populate workshop location
				if (r.message.default_workshop_location && !frm.doc.to_location) {
					frm.set_value('to_location', r.message.default_workshop_location);
				}
				
				// Set required fields indicator
				if (r.message.require_odometer_reading) {
					frm.toggle_reqd('odometer_reading', true);
				}
				
				if (r.message.require_estimated_completion_date) {
					frm.toggle_reqd('estimated_completion_date', true);
				}
				
				// Always require these for workshop
				frm.toggle_reqd('workshop_reason', true);
				frm.toggle_reqd('purpose', true);
			}
		}
	});
}

function get_last_odometer_reading(frm) {
	frappe.call({
		method: 'frappe.client.get_list',
		args: {
			doctype: 'Vehicle Movements',
			filters: {
				vehicle: frm.doc.vehicle,
				odometer_reading: ['!=', '']
			},
			fields: ['odometer_reading'],
			order_by: 'movement_date desc',
			limit: 1
		},
		callback: function(r) {
			if (r.message && r.message.length > 0) {
				let last_reading = r.message[0].odometer_reading;
				frm.set_df_property('odometer_reading', 'description', 
					`Last recorded odometer reading: ${last_reading} km`);
			}
		}
	});
}

function mark_workshop_completed(frm) {
	frappe.prompt([
		{
			fieldname: 'actual_completion_date',
			fieldtype: 'Date',
			label: 'Actual Completion Date',
			reqd: 1,
			default: frappe.datetime.get_today()
		},
		{
			fieldname: 'workshop_notes',
			fieldtype: 'Small Text',
			label: 'Completion Notes'
		},
		{
			fieldname: 'update_vehicle_status',
			fieldtype: 'Check',
			label: 'Update Vehicle Status to Available',
			default: 1
		}
	], function(values) {
		frappe.call({
			method: 'leetrental.leetrental.doctype.vehicle_movements.vehicle_movements.mark_workshop_completed',
			args: {
				movement_name: frm.doc.name,
				actual_completion_date: values.actual_completion_date,
				workshop_notes: values.workshop_notes,
				update_vehicle_status: values.update_vehicle_status
			},
			callback: function(r) {
				if (!r.exc) {
					frappe.msgprint(__('Workshop movement marked as completed'));
					frm.reload_doc();
				}
			}
		});
	}, __('Complete Workshop Movement'), __('Complete'));
}

function update_workshop_status(frm) {
	frappe.prompt([
		{
			fieldname: 'workshop_status',
			fieldtype: 'Select',
			label: 'Workshop Status',
			options: 'Pending\nIn Progress\nCompleted\nOn Hold',
			reqd: 1,
			default: frm.doc.workshop_status
		},
		{
			fieldname: 'notes',
			fieldtype: 'Small Text',
			label: 'Status Update Notes'
		}
	], function(values) {
		frm.set_value('workshop_status', values.workshop_status);
		
		if (values.notes) {
			let current_notes = frm.doc.workshop_notes || '';
			let timestamp = frappe.datetime.now_datetime();
			let new_note = `[${timestamp}] Status: ${values.workshop_status}\n${values.notes}\n\n`;
			frm.set_value('workshop_notes', new_note + current_notes);
		}
		
		frm.save();
	}, __('Update Workshop Status'), __('Update'));
}

function show_workshop_summary(frm) {
	let days_in_workshop = 0;
	if (frm.doc.movement_date) {
		let end_date = frm.doc.actual_completion_date || frappe.datetime.get_today();
		days_in_workshop = frappe.datetime.get_day_diff(end_date, frm.doc.movement_date);
	}
	
	let html = `
		<div style="padding: 10px; background-color: #f8f9fa; border-radius: 5px; margin-top: 10px;">
			<h4 style="margin-top: 0;">Workshop Summary</h4>
			<table style="width: 100%;">
				<tr>
					<td><strong>Days in Workshop:</strong></td>
					<td>${days_in_workshop} days</td>
				</tr>
				<tr>
					<td><strong>Current Status:</strong></td>
					<td><span class="indicator ${get_status_color(frm.doc.workshop_status)}">${frm.doc.workshop_status}</span></td>
				</tr>
			</table>
		</div>
	`;
	
	frm.set_df_property('workshop_notes', 'description', html);
}

function get_status_color(status) {
	const colors = {
		'Pending': 'orange',
		'In Progress': 'blue',
		'Completed': 'green',
		'On Hold': 'red'
	};
	return colors[status] || 'gray';
}