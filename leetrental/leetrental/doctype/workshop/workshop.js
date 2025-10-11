// Copyright (c) 2024, Your Company and contributors
// For license information, please see license.txt

frappe.ui.form.on('Workshop', {
    refresh: function(frm) {
        // Add status transition buttons
        if (frm.doc.status === 'Vehicle Entry') {
            frm.add_custom_button(__('Start Work'), function() {
                frm.set_value('status', 'Vehicle Work in Progress');
                frm.set_value('start_datetime', frappe.datetime.now_datetime());
                frm.save();
            }).addClass('btn-primary');
        }
        
        if (frm.doc.status === 'Vehicle Work in Progress') {
            frm.add_custom_button(__('Request Approval'), function() {
                frm.set_value('status', 'Approval Pending');
                frm.save();
            });
            
            frm.add_custom_button(__('Mark as Completed'), function() {
                frm.set_value('status', 'Completed');
                frm.set_value('actual_completion', frappe.datetime.now_datetime());
                frm.save();
            }).addClass('btn-success');
        }
        
        if (frm.doc.status === 'Approval Pending') {
            frm.add_custom_button(__('Approve'), function() {
                frappe.prompt({
                    label: 'Approval Notes',
                    fieldname: 'approval_notes',
                    fieldtype: 'Small Text'
                }, function(values) {
                    frappe.call({
                        method: 'leetrental.leetrental.doctype.workshop.workshop.approve_workshop',
                        args: {
                            workshop_name: frm.doc.name,
                            approved_by: frappe.session.user,
                            approval_notes: values.approval_notes
                        },
                        callback: function(r) {
                            frm.reload_doc();
                        }
                    });
                }, __('Approve Workshop'), __('Approve'));
            }).addClass('btn-success');
        }
        
        if (frm.doc.status === 'Approved') {
            frm.add_custom_button(__('Start Test Run'), function() {
                frm.set_value('test_run_status', 'In Progress');
                frm.set_value('test_run_by', frappe.session.user);
                frm.set_value('test_run_date', frappe.datetime.now_datetime());
                frm.save();
            });
        }
        
        if (frm.doc.test_run_status === 'In Progress') {
            frm.add_custom_button(__('Test Run Passed'), function() {
                frm.set_value('test_run_status', 'Passed');
                frm.set_value('status', 'Completed');
                frm.set_value('actual_completion', frappe.datetime.now_datetime());
                frm.save();
            }, __('Test Run')).addClass('btn-success');
            
            frm.add_custom_button(__('Test Run Failed'), function() {
                frappe.prompt({
                    label: 'Failure Reason',
                    fieldname: 'reason',
                    fieldtype: 'Text',
                    reqd: 1
                }, function(values) {
                    frm.set_value('test_run_status', 'Failed');
                    frm.set_value('status', 'Test Run Failed');
                    frm.set_value('test_run_failed_reason', values.reason);
                    frm.save();
                }, __('Test Run Failed'), __('Submit'));
            }, __('Test Run')).addClass('btn-danger');
        }
        
        // Add transfer button
        if (frm.doc.status !== 'Completed' && frm.doc.status !== 'Cancelled' && !frm.doc.__islocal) {
            frm.add_custom_button(__('Transfer to Another Workshop'), function() {
                frappe.new_doc('Workshop Transfer', {
                    workshop: frm.doc.name,
                    vehicle: frm.doc.vehicle,
                    from_workshop: frm.doc.garage,
                    odometer_reading: frm.doc.entry_odometer
                });
            });
        }
        
        // Display vehicle info
        if (frm.doc.vehicle && frm.doc.license_plate) {
            display_workshop_vehicle_info(frm);
        }
    },
    
    vehicle: function(frm) {
        if (frm.doc.vehicle) {
            // Fetch vehicle information
            frappe.call({
                method: 'frappe.client.get_value',
                args: {
                    doctype: 'Vehicles',
                    filters: { name: frm.doc.vehicle },
                    fieldname: ['license_plate', 'last_odometer', 'make', 'model', 'year', 'chassis_no', 'fuel_type', 'color']
                },
                callback: function(r) {
                    if (r.message) {
                        frm.set_value('license_plate', r.message.license_plate);
                        frm.set_value('make', r.message.make);
                        frm.set_value('model', r.message.model);
                        frm.set_value('year', r.message.year);
                        frm.set_value('vin', r.message.chassis_no);
                        frm.set_value('fuel_type', r.message.fuel_type);
                        frm.set_value('color', r.message.color);
                        
                        if (r.message.last_odometer && !frm.doc.entry_odometer) {
                            frm.set_value('entry_odometer', r.message.last_odometer);
                        }
                        
                        frm.refresh_fields();
                    }
                }
            });
        }
    }
});

// Sub Job table events
frappe.ui.form.on('Workshop Sub Job', {
    actual_hours: function(frm, cdt, cdn) {
        calculate_sub_job_cost(frm, cdt, cdn);
    },
    
    labor_rate: function(frm, cdt, cdn) {
        calculate_sub_job_cost(frm, cdt, cdn);
    },
    
    estimated_hours: function(frm, cdt, cdn) {
        calculate_sub_job_cost(frm, cdt, cdn);
    }
});

function calculate_sub_job_cost(frm, cdt, cdn) {
    let row = locals[cdt][cdn];
    let hours = row.actual_hours || row.estimated_hours || 0;
    let rate = row.labor_rate || 0;
    frappe.model.set_value(cdt, cdn, 'labor_cost', hours * rate);
}

function display_workshop_vehicle_info(frm) {
    let info = `
        <div style="font-size: 13px;">
            <strong>${frm.doc.make || ''} ${frm.doc.model || ''} ${frm.doc.year ? '(' + frm.doc.year + ')' : ''}</strong><br>
            License Plate: <strong>${frm.doc.license_plate}</strong> | 
            Odometer: <strong>${frm.doc.entry_odometer ? frm.doc.entry_odometer.toLocaleString() + ' km' : 'N/A'}</strong>
        </div>
    `;
    
    if (frm.doc.current_stage) {
        info += `
            <div style="margin-top: 8px; font-size: 12px; color: #666;">
                Current Stage: <strong>${frm.doc.current_stage}</strong>
            </div>
        `;
    }
    
    frm.dashboard.add_comment(info, 'blue', true);
}