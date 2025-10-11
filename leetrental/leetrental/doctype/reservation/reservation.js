// Copyright (c) 2024, LeetRental and contributors
// For license information, please see license.txt

frappe.ui.form.on('Reservation', {
    refresh: function(frm) {
        // Add custom buttons based on status
        if (frm.doc.docstatus === 1) {
            // Add button to mark as Expired
            if (frm.doc.reservation_status === 'Confirmed') {
                frm.add_custom_button(__('Mark as Expired'), function() {
                    frappe.call({
                        method: 'frappe.client.set_value',
                        args: {
                            doctype: 'Reservation',
                            name: frm.doc.name,
                            fieldname: 'reservation_status',
                            value: 'Expired'
                        },
                        callback: function(r) {
                            if (!r.exc) {
                                frm.reload_doc();
                                frappe.show_alert({
                                    message: __('Reservation marked as Expired'),
                                    indicator: 'orange'
                                });
                            }
                        }
                    });
                }, __('Actions'));
            }
            
            // Add button to create Car Reservation
            if (frm.doc.reservation_status === 'Confirmed') {
                frm.add_custom_button(__('Create Car Reservation'), function() {
                    frappe.model.open_mapped_doc({
                        method: 'leetrental.leetrental.doctype.reservation.reservation.make_rental_agreement',
                        frm: frm
                    });
                }, __('Create'));
            }
        }
        
        // Set color indicators for status
        if (frm.doc.reservation_status) {
            const status_colors = {
                'Draft': 'gray',
                'Confirmed': 'blue',
                'Cancelled': 'red',
                'Expired': 'orange'
            };
            
            frm.set_df_property('reservation_status', 'options', 
                frm.fields_dict.reservation_status.df.options.split('\n').map(status => {
                    return status;
                }).join('\n')
            );
        }
    },
    
    customer: function(frm) {
        // Fetch customer name
        if (frm.doc.customer) {
            frappe.db.get_value('Customer', frm.doc.customer, 'customer_name', (r) => {
                if (r && r.customer_name) {
                    frm.set_value('customer_name', r.customer_name);
                }
            });
        }
    },
    
    vehicle: function(frm) {
        // Fetch vehicle details
        if (frm.doc.vehicle) {
            frappe.db.get_value('Vehicles', frm.doc.vehicle, ['make_and_model', 'status'], (r) => {
                if (r) {
                    frm.set_value('vehicle_details', r.make_and_model);
                    
                    // Warn if vehicle is not available
                    if (r.status !== 'Available') {
                        frappe.msgprint({
                            title: __('Warning'),
                            indicator: 'orange',
                            message: __('Vehicle status is: {0}', [r.status])
                        });
                    }
                }
            });
        }
    },
    
    pick_up_datetime: function(frm) {
        validate_dates(frm);
    },
    
    return_datetime: function(frm) {
        validate_dates(frm);
    },
    
    rate_plan: function(frm) {
        // Optionally fetch default deposit amount from pricing plan
        if (frm.doc.rate_plan) {
            frappe.db.get_value('Pricing Plan', frm.doc.rate_plan, 'deposit_amount', (r) => {
                if (r && r.deposit_amount && !frm.doc.deposit_amount) {
                    frm.set_value('deposit_amount', r.deposit_amount);
                }
            });
        }
    }
});

function validate_dates(frm) {
    if (frm.doc.pick_up_datetime && frm.doc.return_datetime) {
        const pick_up = frappe.datetime.str_to_obj(frm.doc.pick_up_datetime);
        const return_dt = frappe.datetime.str_to_obj(frm.doc.return_datetime);
        
        if (return_dt <= pick_up) {
            frappe.msgprint({
                title: __('Invalid Dates'),
                indicator: 'red',
                message: __('Return Datetime must be after Pick Up Datetime')
            });
            frm.set_value('return_datetime', '');
        }
        
        // Calculate duration
        const duration_ms = return_dt - pick_up;
        const duration_days = Math.ceil(duration_ms / (1000 * 60 * 60 * 24));
        
        if (duration_days > 0) {
            frappe.show_alert({
                message: __('Reservation Duration: {0} day(s)', [duration_days]),
                indicator: 'blue'
            }, 5);
        }
    }
}