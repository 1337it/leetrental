// File: your_app/your_app/vehicles/vehicles.js
// Client script with auto-create for Vehicles Model (Server API)

frappe.ui.form.on('Vehicles', {
    refresh: function(frm) {
        // Remove any existing decode button first
        frm.remove_custom_button('🔍 Decode VIN');
        
        // Add decode button if chassis number exists
        if (frm.doc.chassis_number && frm.doc.chassis_number.length >= 11) {
            frm.add_custom_button(__('🔍 Decode VIN'), function() {
                decode_vehicle_vin(frm);
            });
        }
        
        // Add helper text for new documents
        if (frm.is_new() && !frm.doc.chassis_number) {
            frm.set_df_property('chassis_number', 'description', 
                'Enter VIN (17 digits) or partial VIN (11+ digits) to auto-fill vehicle details');
        }
    },
    
    chassis_number: function(frm) {
        // Clean and validate VIN
        if (frm.doc.chassis_number) {
            let vin = frm.doc.chassis_number.toUpperCase().replace(/\s/g, '');
            frm.set_value('chassis_number', vin);
            
            // Validate VIN format
            if (vin.length >= 11) {
                validate_vin_format(frm, vin);
            }
        }
    },
    
    // Optional: Add quick decode button next to chassis field
    onload: function(frm) {
        // Add custom button next to chassis_number field (only once)
        if (frm.fields_dict.chassis_number) {
            let wrapper = frm.fields_dict.chassis_number.$wrapper.find('.control-input-wrapper');
            
            // Remove any existing decode button
            wrapper.find('.btn-decode-vin').remove();
            
            // Add the button
            wrapper.append(
                `<button class="btn btn-xs btn-default btn-decode-vin" style="margin-left: 5px;" 
                    onclick="decode_from_inline()">Decode</button>`
            );
        }
    }
});

function validate_vin_format(frm, vin) {
    // Client-side quick validation before API call
    frappe.call({
        method: 'leetrental.leetrental.doctype.vehicles.api.validate_vin',
        args: { vin: vin },
        callback: function(r) {
            if (r.message && !r.message.valid) {
                frappe.msgprint({
                    title: __('Invalid VIN'),
                    message: r.message.message,
                    indicator: 'orange'
                });
            } else if (r.message && r.message.valid) {
                // VIN is valid, ask user to decode
                if (!frm.doc.model_year || !frm.doc.custom_make) {
                    frappe.confirm(
                        __('Valid VIN detected. Would you like to auto-fill vehicle details?<br><small>This will automatically create Manufacturer and Model records if they don\'t exist.</small>'),
                        function() {
                            decode_vehicle_vin(frm);
                        }
                    );
                }
            }
        }
    });
}

function decode_vehicle_vin(frm) {
    const vin = frm.doc.chassis_number;
    
    if (!vin || vin.length < 11) {
        frappe.msgprint({
            title: __('Invalid VIN'),
            message: __('Please enter a valid VIN/Chassis Number (at least 11 characters)'),
            indicator: 'red'
        });
        return;
    }
    
    // Show loading indicator
    frappe.dom.freeze(__('Decoding VIN from NHTSA database...<br><small>Creating missing records if needed...</small>'));
    
    // Call server-side method
    frappe.call({
        method: 'leetrental.leetrental.doctype.vehicles.api.decode_vehicle_vin',
        args: {
            vin: vin,
            model_year: frm.doc.model_year || null
        },
        callback: function(r) {
            frappe.dom.unfreeze();
            
            if (r.message && r.message.success) {
                const data = r.message.data;
                const raw_data = r.message.raw_data;
                
                // Populate fields
                populate_fields_from_api(frm, data, raw_data);
                
                // Show success message with created records info
                let vehicle_info = '';
                if (raw_data) {
                    vehicle_info = `${raw_data.ModelYear || ''} ${raw_data.Make || ''} ${raw_data.Model || ''}`;
                }
                
                let message = __('VIN Decoded: {0}', [vehicle_info]);
                
                // Check if manufacturer or model was created
                if (data.custom_make || data.model) {
                    message += '<br><small>';
                    if (data.custom_make) {
                        message += __('✓ Manufacturer linked: {0}<br>', [data.custom_make]);
                    }
                    if (data.model) {
                        message += __('✓ Model linked: {0}', [data.model]);
                    }
                    message += '</small>';
                }
                
                frappe.show_alert({
                    message: message,
                    indicator: 'green'
                }, 10);
                
            } else {
                frappe.msgprint({
                    title: __('Decoding Failed'),
                    message: r.message.message || __('Unable to decode VIN'),
                    indicator: 'red'
                });
            }
        },
        error: function(err) {
            frappe.dom.unfreeze();
            frappe.msgprint({
                title: __('Error'),
                message: __('Failed to decode VIN. Please try again.'),
                indicator: 'red'
            });
            console.error('VIN Decode Error:', err);
        }
    });
}

function populate_fields_from_api(frm, mapped_data, raw_data) {
    let updated_count = 0;
    
    // Set all mapped fields
    for (let field in mapped_data) {
        if (field.startsWith('_')) continue; // Skip internal fields
        
        if (frm.fields_dict[field] && mapped_data[field]) {
            frm.set_value(field, mapped_data[field]);
            updated_count++;
        }
    }
    
    // Show additional information dialog
    if (raw_data && mapped_data._additional_info) {
        show_additional_info_dialog(frm, mapped_data._additional_info, raw_data);
    }
    
    // Mark form as modified
    frm.dirty();
    
    console.log(`VIN Decoder: Updated ${updated_count} fields`);
    
    // Refresh the form to show the linked records
    frm.refresh_fields();
}

function show_additional_info_dialog(frm, additional_info, raw_data) {
    // Build HTML table with additional information
    let html = '<div class="vin-decode-info">';
    html += '<h4>Decoded Vehicle Information</h4>';
    html += '<table class="table table-bordered table-sm">';
    html += '<tbody>';
    
    const display_fields = {
        'Make': additional_info.make,
        'Manufacturer': additional_info.manufacturer,
        'Model': additional_info.model,
        'Body Class': additional_info.body_class,
        'Vehicle Type': additional_info.vehicle_type,
        'Drive Type': additional_info.drive_type,
        'Displacement': additional_info.displacement_l ? `${additional_info.displacement_l}L (${additional_info.displacement_cc}cc)` : null,
        'Engine Configuration': additional_info.engine_config,
        'Fuel Injection': additional_info.fuel_injection,
        'Turbo': additional_info.turbo,
        'Top Speed': additional_info.top_speed_mph ? `${additional_info.top_speed_mph} mph` : null,
        'GVWR Class': additional_info.gvwr,
        'Manufacturing Country': additional_info.plant_country,
    };
    
    for (let label in display_fields) {
        if (display_fields[label] && display_fields[label] !== 'Not Applicable') {
            html += `<tr><td><strong>${label}</strong></td><td>${display_fields[label]}</td></tr>`;
        }
    }
    
    html += '</tbody></table>';
    
    // Add safety features if available
    if (raw_data.ABS || raw_data.ESC || raw_data.TractionControl) {
        html += '<h5>Safety Features</h5>';
        html += '<table class="table table-bordered table-sm"><tbody>';
        
        if (raw_data.ABS) html += `<tr><td><strong>ABS</strong></td><td>${raw_data.ABS}</td></tr>`;
        if (raw_data.ESC) html += `<tr><td><strong>Electronic Stability Control</strong></td><td>${raw_data.ESC}</td></tr>`;
        if (raw_data.TractionControl) html += `<tr><td><strong>Traction Control</strong></td><td>${raw_data.TractionControl}</td></tr>`;
        if (raw_data.AirBagLocFront) html += `<tr><td><strong>Airbags</strong></td><td>${raw_data.AirBagLocFront}</td></tr>`;
        
        html += '</tbody></table>';
    }
    
    html += '</div>';
    
    // Show dialog
    frappe.msgprint({
        title: __('Additional Vehicle Information'),
        message: html,
        indicator: 'blue',
        wide: true
    });
}

// Global function for inline decode button
window.decode_from_inline = function() {
    let frm = cur_frm;
    if (frm && frm.doc.chassis_number) {
        decode_vehicle_vin(frm);
    }
};

// Add VIN validation on form validate
frappe.ui.form.on('Vehicles', {
    validate: function(frm) {
        if (frm.doc.chassis_number) {
            const vin = frm.doc.chassis_number;
            
            // Basic validation
            if (vin.length === 17) {
                const invalidChars = /[IOQioq]/;
                if (invalidChars.test(vin)) {
                    frappe.msgprint({
                        title: __('Invalid VIN'),
                        message: __('Full VIN cannot contain letters I, O, or Q'),
                        indicator: 'orange'
                    });
                    frappe.validated = false;
                }
            } else if (vin.length < 11) {
                frappe.msgprint({
                    title: __('Invalid VIN'),
                    message: __('VIN must be at least 11 characters'),
                    indicator: 'orange'
                });
                frappe.validated = false;
            }
        }
    }
});

// Optional: Auto-decode on form load if VIN exists but details missing
frappe.ui.form.on('Vehicles', {
    onload_post_render: function(frm) {
        if (frm.doc.chassis_number && 
            frm.doc.chassis_number.length >= 11 && 
            !frm.doc.model_year && 
            !frm.is_new()) {
            
            // Auto-decode if no model year set
            setTimeout(function() {
                frappe.show_alert({
                    message: __('Click "Decode VIN" to auto-fill vehicle details'),
                    indicator: 'blue'
                }, 5);
            }, 1000);
        }
    }
});

// Add custom function to manually create manufacturer
function create_manufacturer_manually(make_name) {
    frappe.prompt([
        {
            'fieldname': 'manufacturer_name',
            'fieldtype': 'Data',
            'label': 'Manufacturer Name',
            'reqd': 1,
            'default': make_name
        }
    ],
    function(values) {
        frappe.call({
            method: 'frappe.client.insert',
            args: {
                doc: {
                    doctype: 'Manufacturers',
                    manufacturer_name: values.manufacturer_name
                }
            },
            callback: function(r) {
                if (r.message) {
                    frappe.show_alert({
                        message: __('Manufacturer created: {0}', [r.message.name]),
                        indicator: 'green'
                    });
                    cur_frm.reload_doc();
                }
            }
        });
    },
    __('Create Manufacturer'),
    __('Create')
    );
}

// Vehicle doctype client script
frappe.ui.form.on('Vehicles', {
  refresh(frm) {
    // Ensure HTML container exists
    if (!frm.doc.__islocal) {
      render_panel(frm);
    } else {
      frm.set_df_property('movement_logs_html', 'options',
        `<div class="text-muted">Save the vehicle first to view movement logs.</div>`);
    }

    // Add a shortcut to create a Movement prefilled with this vehicle
    if (!frm.is_new()) {
      frm.add_custom_button('New Vehicle Movement', () => {
        frappe.new_doc('Vehicle Movement', {
          vehicle: frm.doc.name
        });
      }, __('Actions'));
    }
  },
  after_save(frm) {
    render_panel(frm);
  }
});

function render_panel(frm) {
  const $wrap = $(frm.get_field('movement_logs_html').wrapper);
  $wrap.empty();

  // Toolbar UI
  const toolbar = $(`
    <div class="flex items-center gap-2" style="margin-bottom:8px;">
      <input type="date" class="form-control" id="vm_from" placeholder="From" style="max-width: 170px;">
      <input type="date" class="form-control" id="vm_to" placeholder="To" style="max-width: 170px;">
      <select class="form-control" id="vm_type" style="max-width: 260px;">
        <option value="">All Movement Types</option>
        <option>NRM/Customer Movement</option>
        <option>NRM/Staff Movement</option>
        <option>Workshop Movement</option>
        <option>Custody Movement</option>
        <option>NRT</option>
      </select>
      <button class="btn btn-sm btn-primary" id="vm_refresh">Filter</button>
    </div>
  `);

  const table = $(`<div id="vm_table"></div>`);
  const pager = $(`
    <div class="flex items-center justify-between" style="margin-top:8px;">
      <div class="text-muted small" id="vm_count"></div>
      <div class="btn-group">
        <button class="btn btn-sm btn-default" id="vm_prev">Prev</button>
        <button class="btn btn-sm btn-default" id="vm_next">Next</button>
      </div>
    </div>
  `);

  $wrap.append(toolbar, table, pager);

  let page = 1;
  const page_len = 10;

  async function load() {
    const from = $('#vm_from').val() || null;
    const to = $('#vm_to').val() || null;
    const mtype = $('#vm_type').val() || null;

	const { message } = await frappe.call({
  method: 'leetrental.leetrental.doctype.vehicle_movements.vehicle_movements.get_vehicle_movements',
  args: {
    vehicle: frm.doc.name,
    from_date: from,
    to_date: to,
    movement_type: mtype,
    page,
    page_len
  },
  freeze: false
});

    const rows = message?.data || [];
    const total = message?.total || 0;

    $('#vm_count').text(total ? `${total} record(s)` : 'No records');

    const html = `
      <div class="table-responsive">
        <table class="table table-bordered table-hover">
          <thead>
            <tr>
              <th style="white-space:nowrap;">Date</th>
              <th>Movement ID</th>
              <th style="white-space:nowrap;">Type</th>
              <th>From → To</th>
              <th style="white-space:nowrap;">Out/In</th>
              <th>Odometer</th>
              <th>Driver</th>
              <th>Customer/Staff</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map(r => `
              <tr>
                <td>${frappe.datetime.str_to_user(r.date || '') || ''}</td>
                <td><a class="bold" href="/app/vehicle-movements/${encodeURIComponent(r.name)}">${r.movement_id || r.name}</a></td>
                <td>${frappe.utils.escape_html(r.movement_type || '')}</td>
                <td>${frappe.utils.escape_html(r.out_from || '')} → ${frappe.utils.escape_html(r.in_to || r.drop_location || '')}</td>
                <td>
                  <div><span class="indicator ${r.out_date_time ? 'blue' : 'gray'}"></span>Out: ${r.out_date_time ? frappe.datetime.str_to_user(r.out_date_time) : '-'}</div>
                  <div><span class="indicator ${r.in_date_time ? 'green' : 'gray'}"></span>In: ${r.in_date_time ? frappe.datetime.str_to_user(r.in_date_time) : '-'}</div>
                </td>
                <td>${r.odometer_value ?? ''} ${r.unit || ''}</td>
                <td>${r.out_driver || r.in_driver || ''}</td>
                <td>${r.out_customer || r.in_customer || r.out_staff || r.in_staff || ''}</td>
                <td>${(r.out_notes || r.in_notes || '').substring(0,120)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
    $('#vm_table').html(html);

    // Enable/disable pager
    const max_page = Math.max(1, Math.ceil(total / page_len));
    $('#vm_prev').prop('disabled', page <= 1);
    $('#vm_next').prop('disabled', page >= max_page);
  }

  $('#vm_refresh').on('click', () => { page = 1; load(); });
  $('#vm_prev').on('click', () => { if (page > 1) { page--; load(); } });
  $('#vm_next').on('click', () => { page++; load(); });

  load();
}

frappe.ui.form.on('Vehicles', {
	update_odometer: function(frm,cdt,cdn) {
		frappe.call({
			method: "leetrental.leetrental.doctype.vehicles.vehicles.update_odometer",
			 args: {
				docname: frm.doc.name
			 },
			callback: function(r) {
				frappe.model.set_value(cdt, cdn, 'last_odometer_value', r.message);
			}
		});
	}
});
