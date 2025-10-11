// Copyright (c) 2024, Your Company and contributors
// For license information, please see license.txt

frappe.ui.form.on('Workshop Transfer', {
    refresh: function(frm) {
        // Add custom buttons based on status
        if (frm.doc.status === 'Pending' && !frm.doc.__islocal) {
            frm.add_custom_button(__('Mark as In Transit'), function() {
                frappe.call({
                    method: 'leetrental.leetrental.doctype.workshop_transfer.workshop_transfer.mark_as_in_transit',
                    args: {
                        transfer_name: frm.doc.name,
                        handed_over_by: frappe.session.user
                    },
                    callback: function(r) {
                        frm.reload_doc();
                    }
                });
            }).addClass('btn-primary');
        }
        
        if (frm.doc.status === 'In Transit' && !frm.doc.__islocal) {
            frm.add_custom_button(__('Mark as Received'), function() {
                frappe.call({
                    method: 'leetrental.leetrental.doctype.workshop_transfer.workshop_transfer.mark_as_received',
                    args: {
                        transfer_name: frm.doc.name,
                        received_by: frappe.session.user
                    },
                    callback: function(r) {
                        frm.reload_doc();
                    }
                });
            }).addClass('btn-success');
        }
        
        if (frm.doc.requires_approval && frm.doc.approval_status === 'Pending' && !frm.doc.__islocal) {
            frm.add_custom_button(__('Approve Transfer'), function() {
                frappe.prompt({
                    label: 'Approval Notes',
                    fieldname: 'approval_notes',
                    fieldtype: 'Small Text'
                }, function(values) {
                    frappe.call({
                        method: 'leetrental.leetrental.doctype.workshop_transfer.workshop_transfer.approve_transfer',
                        args: {
                            transfer_name: frm.doc.name,
                            approved_by: frappe.session.user,
                            approval_notes: values.approval_notes
                        },
                        callback: function(r) {
                            frm.reload_doc();
                        }
                    });
                }, __('Approve Transfer'), __('Approve'));
            }).addClass('btn-primary');
        }
        
        // Add notification button
        if (frm.doc.status !== 'Cancelled' && !frm.doc.customer_notified) {
            frm.add_custom_button(__('Notify Customer'), function() {
                frappe.msgprint('Customer notification feature to be implemented');
                frm.set_value('customer_notified', 1);
                frm.set_value('notification_sent', frappe.datetime.now_datetime());
            });
        }
    },
    
    workshop: function(frm) {
        if (frm.doc.workshop) {
            // Load pending jobs from workshop
            frappe.call({
                method: 'frappe.client.get',
                args: {
                    doctype: 'Workshop',
                    name: frm.doc.workshop
                },
                callback: function(r) {
                    if (r.message) {
                        // Clear existing pending jobs
                        frm.clear_table('pending_jobs');
                        
                        // Add incomplete jobs
                        if (r.message.sub_jobs) {
                            r.message.sub_jobs.forEach(function(job) {
                                if (job.status !== 'Completed') {
                                    let row = frm.add_child('pending_jobs');
                                    row.job_title = job.job_title;
                                    row.job_type = job.job_type;
                                    row.status = job.status;
                                    row.priority = job.priority;
                                    row.completion_percentage = job.completion_percentage;
                                    row.description = job.job_description;
                                    row.work_done = job.findings;
                                    row.remaining_work = job.notes;
                                }
                            });
                        }
                        
                        frm.refresh_field('pending_jobs');
                    }
                }
            });
        }
    },
    
    handover_datetime: function(frm) {
        calculate_duration(frm);
    },
    
    received_datetime: function(frm) {
        calculate_duration(frm);
    }
});

function calculate_duration(frm) {
    if (frm.doc.handover_datetime && frm.doc.received_datetime) {
        let start = frappe.datetime.str_to_obj(frm.doc.handover_datetime);
        let end = frappe.datetime.str_to_obj(frm.doc.received_datetime);
        let duration = (end - start) / 1000; // in seconds
        frm.set_value('transfer_duration', duration);
    }
}