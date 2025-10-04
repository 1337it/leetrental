leetrental.leetrental.doctype

// File: your_app/your_app/vehicles/vehicles.js
// Custom VIN Decoder for your Vehicles DocType

frappe.ui.form.on('Vehicles', {
    refresh: function(frm) {
        // Add decode button if chassis number exists
        if (frm.doc.chassis_number && frm.doc.chassis_number.length >= 11) {
            frm.add_custom_button(__('🔍 Decode VIN'), function() {
                decode_chassis_number(frm);
            });
        }
    },
    
    chassis_number: function(frm) {
        // Clean and validate VIN
        if (frm.doc.chassis_number) {
            let vin = frm.doc.chassis_number.toUpperCase().replace(/\s/g, '');
            frm.set_value('chassis_number', vin);
            
            // Auto-decode for valid VIN length
            if (vin.length >= 11) {
                // Ask user if they want to decode
                frappe.confirm(
                    __('Do you want to auto-fill vehicle details from VIN?'),
                    function() {
                        decode_chassis_number(frm);
                    }
                );
            }
        }
    }
});

function decode_chassis_number(frm) {
    const vin = frm.doc.chassis_number;
    
    if (!vin || vin.length < 11) {
        frappe.msgprint({
            title: __('Invalid VIN'),
            message: __('Please enter a valid VIN/Chassis Number (at least 11 characters)'),
            indicator: 'red'
        });
        return;
    }
    
    // Show loading
    frappe.dom.freeze(__('Decoding VIN from NHTSA database...'));
    
    // Build API URL
    const modelYear = frm.doc.model_year || '';
    const apiUrl = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json&modelyear=${modelYear}`;
    
    // Make API call
    fetch(apiUrl)
        .then(response => response.json())
        .then(data => {
            frappe.dom.unfreeze();
            
            if (data.Results && data.Results.length > 0) {
                const result = data.Results[0];
                
                // Check if decode was successful
                if (result.ErrorCode && result.ErrorCode.includes('0')) {
                    populate_vehicle_fields(frm, result);
                    
                    frappe.show_alert({
                        message: __('VIN decoded: {0} {1} {2}', [
                            result.ModelYear || '',
                            result.Make || '',
                            result.Model || ''
                        ]),
                        indicator: 'green'
                    }, 7);
                } else {
                    frappe.msgprint({
                        title: __('Decoding Failed'),
                        message: result.ErrorText || __('Unable to decode VIN'),
                        indicator: 'orange'
                    });
                }
            }
        })
        .catch(error => {
            frappe.dom.unfreeze();
            frappe.msgprint({
                title: __('Error'),
                message: __('Failed to decode VIN. Please check your internet connection.'),
                indicator: 'red'
            });
            console.error('VIN Decode Error:', error);
        });
}

function populate_vehicle_fields(frm, data) {
    // Field mapping specific to your DocType
    const fieldMapping = {
        // Basic Vehicle Info
        'model_year': data.ModelYear,
        'custom_variant': data.Trim || data.Series,
        
        // Make - Since it's a Link field to "Manufacturers", we'll set it as text
        // You may need to create the Manufacturer record first or handle it differently
        // For now, we'll just show it in the variant or description
        
        // Engine & Performance
        'custom_engine_number': data.EngineModel,
        'custom_cylinders': data.EngineCylinders,
        'horsepower': data.EngineHP || data.EngineKW,
        'power': data.EngineHP || data.EngineKW,
        
        // Specifications
        'seats_number': data.SeatingRows ? (parseInt(data.SeatingRows) * 2).toString() : data.Doors === '2' ? '2' : '5',
        'doors_number': data.Doors,
        
        // Fuel & Emissions
        'fuel_type': map_fuel_type(data.FuelTypePrimary),
        'co2_emissions': data.DisplacementCC ? (parseFloat(data.DisplacementCC) * 0.12) : null, // Approximate
        
        // Transmission
        'transmission': map_transmission(data.TransmissionStyle),
    };
    
    // Set fields
    let updated_count = 0;
    for (let field in fieldMapping) {
        const value = fieldMapping[field];
        if (value && value !== 'Not Applicable' && value !== '' && frm.fields_dict[field]) {
            frm.set_value(field, value);
            updated_count++;
        }
    }
    
    // Handle Make separately since it's a Link field
    if (data.Make) {
        // Store make info in description or custom field
        let make_info = `${data.Manufacturer || data.Make}`;
        
        // Update description with vehicle details
        let vehicle_details = `Vehicle Information (Auto-decoded from VIN):\n`;
        vehicle_details += `Make: ${data.Make}\n`;
        vehicle_details += `Manufacturer: ${data.Manufacturer}\n`;
        vehicle_details += `Model: ${data.Model}\n`;
        vehicle_details += `Year: ${data.ModelYear}\n`;
        vehicle_details += `Body Class: ${data.BodyClass || 'N/A'}\n`;
        vehicle_details += `Vehicle Type: ${data.VehicleType || 'N/A'}\n`;
        
        if (data.EngineModel) vehicle_details += `Engine Model: ${data.EngineModel}\n`;
        if (data.DisplacementL) vehicle_details += `Displacement: ${data.DisplacementL}L\n`;
        if (data.DriveType) vehicle_details += `Drive Type: ${data.DriveType}\n`;
        if (data.PlantCountry) vehicle_details += `Made in: ${data.PlantCountry}\n`;
        
        vehicle_details += `\n${frm.doc.description || ''}`;
        
        frm.set_value('description', vehicle_details);
    }
    
    // Handle Model - since it's also a Link field, we'll need special handling
    if (data.Model) {
        // Try to set the model if it exists
        frappe.db.get_value('Vehicles Model', {'name': data.Model}, 'name', (r) => {
            if (r && r.name) {
                frm.set_value('model', r.name);
            } else {
                // Model doesn't exist, add to description
                frappe.msgprint({
                    title: __('Model Not Found'),
                    message: __('The model "{0}" was not found in your database. Please create it first or add it to the description.', [data.Model]),
                    indicator: 'orange'
                });
            }
        });
    }
    
    // Additional decoded information
    const additional_info = {
        'Body Class': data.BodyClass,
        'Vehicle Type': data.VehicleType,
        'Drive Type': data.DriveType,
        'ABS': data.ABS,
        'Airbags': data.AirBagLocFront,
        'Manufacturing Country': data.PlantCountry,
        'Manufacturing City': data.PlantCity,
        'Engine Configuration': data.EngineConfiguration,
        'Fuel Injection': data.FuelInjectionType,
        'Turbo': data.Turbo,
        'Top Speed (MPH)': data.TopSpeedMPH,
        'GVWR': data.GVWR,
        'Brake System': data.BrakeSystemType,
        'ESC': data.ESC,
        'Traction Control': data.TractionControl,
    };
    
    // Show summary dialog
    let summary = '<table class="table table-bordered"><tbody>';
    for (let key in additional_info) {
        if (additional_info[key] && additional_info[key] !== 'Not Applicable') {
            summary += `<tr><td><b>${key}</b></td><td>${additional_info[key]}</td></tr>`;
        }
    }
    summary += '</tbody></table>';
    
    frappe.msgprint({
        title: __('VIN Decoded Successfully'),
        message: __('Updated {0} fields. Additional Information:', [updated_count]) + '<br><br>' + summary,
        indicator: 'green',
        wide: true
    });
    
    // Mark form as dirty
    frm.dirty();
}

// Helper function to map fuel types
function map_fuel_type(api_fuel) {
    if (!api_fuel) return null;
    
    const fuel_map = {
        'Gasoline': 'Gasoline',
        'Diesel': 'Diesel',
        'Liquefied Petroleum Gas (LPG)': 'LPG',
        'LPG': 'LPG',
        'Electric': 'Electric',
        'Plug-in Hybrid': 'Hybrid',
        'Hybrid': 'Hybrid',
        'E85': 'Gasoline',
        'Flex Fuel': 'Gasoline',
    };
    
    for (let key in fuel_map) {
        if (api_fuel.includes(key)) {
            return fuel_map[key];
        }
    }
    
    return null;
}

// Helper function to map transmission types
function map_transmission(api_transmission) {
    if (!api_transmission) return null;
    
    if (api_transmission.toLowerCase().includes('manual')) {
        return 'Manual';
    } else if (api_transmission.toLowerCase().includes('auto') || 
               api_transmission.toLowerCase().includes('cvt') ||
               api_transmission.toLowerCase().includes('dct')) {
        return 'Automatic';
    }
    
    return null;
}

// Add VIN validation
frappe.ui.form.on('Vehicles', {
    validate: function(frm) {
        if (frm.doc.chassis_number) {
            const vin = frm.doc.chassis_number;
            
            // Check for invalid characters in full VIN
            if (vin.length === 17) {
                const invalidChars = /[IOQioq]/;
                if (invalidChars.test(vin)) {
                    frappe.msgprint({
                        title: __('Invalid VIN'),
                        message: __('VIN cannot contain letters I, O, or Q'),
                        indicator: 'orange'
                    });
                    frappe.validated = false;
                }
            }
        }
    }
});

// Optional: Add button to update make/model from decoded data
frappe.ui.form.on('Vehicles', {
    refresh: function(frm) {
        // Add helper text
        if (frm.is_new() && !frm.doc.chassis_number) {
            frm.set_df_property('chassis_number', 'description', 
                'Enter VIN (17 chars) or partial VIN (11+ chars) to auto-fill vehicle details');
        }
    }
});

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
