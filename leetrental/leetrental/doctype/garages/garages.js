// Copyright (c) 2024, Your Company and contributors
// For license information, please see license.txt

frappe.ui.form.on('Garages', {
    refresh: function(frm) {
        if (frm.doc.status === 'Active') {
            frm.add_custom_button(__('Mark as Inactive'), function() {
                frm.set_value('status', 'Inactive');
                frm.save();
            });
        }
        
        if (frm.doc.phone) {
            frm.add_custom_button(__('Call'), function() {
                window.open('tel:' + frm.doc.phone);
            }, __('Contact'));
        }
        
        if (frm.doc.email) {
            frm.add_custom_button(__('Email'), function() {
                window.open('mailto:' + frm.doc.email);
            }, __('Contact'));
        }
    }
});