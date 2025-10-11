// Copyright (c) 2024, Your Company and contributors
// For license information, please see license.txt

frappe.ui.form.on('Car Service', {
    refresh: function(frm) {
        if (frm.doc.status === 'Scheduled') {
            frm.add_custom_button(__('Start Service'), function() {
                frm.set_value('status', 'In Progress');
                frm.save();
            });
        }
        
        if (frm.doc.status === 'In Progress') {
            frm.add_custom_button(__('Complete Service'), function() {
                frm.set_value('status', 'Completed');
                frm.set_value('completion_date', frappe.datetime.nowdate());
                frm.save();
            });
        }
        
        // Add button to create Vehicle Movement
        if (frm.doc.vehicle && frm.doc.garage) {
            frm.add_custom_button(__('Create Vehicle Movement'), function() {
                frappe.new_doc('Vehicle Movement', {
                    vehicle: frm.doc.vehicle,
                    purpose: 'Service',
                    from_location: 'Current Location',
                    to_location: frm.doc.garage
                });
            });
        }
        
        // Display vehicle information alert
        if (frm.doc.vehicle && frm.doc.license_plate) {
            display_vehicle_info_alert(frm);
        }
    },
    
    labor_cost: function(frm) {
        calculate_total(frm);
    },
    
    parts_cost: function(frm) {
        calculate_total(frm);
    },
    
    other_costs: function(frm) {
        calculate_total(frm);
    },
    
    vehicle: function(frm) {
        if (frm.doc.vehicle) {
            // Fetch all vehicle information in one call
            frappe.call({
                method: 'leetrental.leetrental.doctype.car_service.car_service.get_vehicle_complete_info',
                args: {
                    vehicle: frm.doc.vehicle
                },
                callback: function(r) {
                    if (r.message) {
                        // Set vehicle basic info
                        if (r.message.vehicle_info) {
                            let v = r.message.vehicle_info;
                            frm.set_value('license_plate', v.license_plate);
                            frm.set_value('make', v.custom_make);
                            frm.set_value('model', v.model);
                            frm.set_value('year', v.model_year);
                            frm.set_value('vin', v.chassis_no);
                            frm.set_value('fuel_type', v.fuel_type);
                            frm.set_value('transmission', v.transmission);
                            
                            // Set odometer reading
                            if (v.last_odometer) {
                                frm.set_value('odometer_reading', v.last_odometer);
                            }
                        }
                        
                        // Set last service information
                        if (r.message.last_service) {
                            let ls = r.message.last_service;
                            frm.set_value('last_service_date', ls.service_date);
                            frm.set_value('last_service_type', ls.service_type);
                            frm.set_value('last_service_odometer', ls.odometer_reading);
                            
                            // Calculate days since last service
                            if (ls.service_date) {
                                let last_service = frappe.datetime.str_to_obj(ls.service_date);
                                let today = frappe.datetime.now_date(true);
                                let days_diff = frappe.datetime.get_day_diff(today, last_service);
                                frm.set_value('days_since_last_service', days_diff);
                            }
                        }
                        
                        // Refresh the form to show fetched data
                        frm.refresh_fields();
                        
                        // Display alert with vehicle information
                        display_vehicle_info_alert(frm);
                    }
                },
                error: function(r) {
                    console.log('Error fetching vehicle info:', r);
                }
            });
        } else {
            // Clear vehicle fields if vehicle is cleared
            frm.set_value('license_plate', '');
            frm.set_value('make', '');
            frm.set_value('model', '');
            frm.set_value('year', '');
            frm.set_value('vin', '');
            frm.set_value('fuel_type', '');
            frm.set_value('transmission', '');
        }
    }
});

function calculate_total(frm) {
    let total = (frm.doc.labor_cost || 0) + (frm.doc.parts_cost || 0) + (frm.doc.other_costs || 0);
    frm.set_value('total_cost', total);
}

function display_vehicle_info_alert(frm) {
    let vehicle_info = `
        <div style="font-size: 13px;">
            <strong>Vehicle: ${frm.doc.vehicle}</strong><br>
            License Plate: <strong>${frm.doc.license_plate || 'N/A'}</strong>
    `;
    
    // Add make/model/year if available
    if (frm.doc.make || frm.doc.model || frm.doc.year) {
        vehicle_info += `<br>${frm.doc.make || ''} ${frm.doc.model || ''} ${frm.doc.year ? '(' + frm.doc.year + ')' : ''}`;
    }
    
    // Add VIN if available
    if (frm.doc.vin) {
        vehicle_info += `<br>VIN: ${frm.doc.vin}`;
    }
    
    // Add fuel type and transmission if available
    if (frm.doc.fuel_type || frm.doc.transmission) {
        vehicle_info += `<br>`;
        if (frm.doc.fuel_type) vehicle_info += `Fuel: ${frm.doc.fuel_type} `;
        if (frm.doc.transmission) vehicle_info += `| Transmission: ${frm.doc.transmission}`;
    }
    
    vehicle_info += `</div>`;
    
    if (frm.doc.last_service_date) {
        vehicle_info += `
            <div style="margin-top: 10px; padding-top: 10px; border-top: 1px solid #d1d8dd; font-size: 12px;">
                <strong>Last Service:</strong> ${frappe.datetime.str_to_user(frm.doc.last_service_date)} 
                (${frm.doc.days_since_last_service || 0} days ago)<br>
                Type: ${frm.doc.last_service_type || 'N/A'} | 
                Odometer: ${frm.doc.last_service_odometer ? frm.doc.last_service_odometer.toLocaleString() + ' km' : 'N/A'}
            </div>
        `;
    }
    
    frm.dashboard.add_comment(vehicle_info, 'blue', true);
}
