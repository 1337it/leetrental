// Copyright (c) 2022, Solufy and contributors
// For license information, please see license.txt

// File: your_app/your_app/vehicles/vehicles.js
// Client Script for Vehicles DocType
// File: your_app/your_app/vehicles/vehicles.js
// Alternative: Server-side VIN decoder implementation

frappe.ui.form.on('Vehicles', {
    refresh: function(frm) {
        // Add custom button in toolbar
        if (frm.doc.chassis_number && !frm.is_new()) {
            frm.add_custom_button(__('🔍 Decode VIN'), function() {
                decode_vin_server(frm);
            });
        }
        
        // Add in dropdown menu
        frm.page.add_menu_item(__('Decode VIN from API'), function() {
            decode_vin_server(frm);
        });
    },
    
    chassis_number: function(frm) {
        // Clean and validate VIN
        if (frm.doc.chassis_number) {
            let vin = frm.doc.chassis_number.toUpperCase().replace(/\s/g, '');
            frm.set_value('chassis_number', vin);
            
            // Auto-decode for valid VIN length
            if (vin.length >= 11 && vin.length <= 17) {
                decode_vin_server(frm);
            }
        }
    },
    
    // Optional: Clear fields when VIN changes
    chassis_number_on_form_rendered: function(frm) {
        if (frm.doc.chassis_number && !frm.doc.make) {
            // VIN exists but no decoded data - show decode button
            show_decode_indicator(frm);
        }
    }
});

function decode_vin_server(frm) {
    const vin = frm.doc.chassis_number;
    
    if (!vin) {
        frappe.msgprint({
            title: __('VIN Required'),
            message: __('Please enter a VIN/Chassis Number first'),
            indicator: 'red'
        });
        return;
    }
    
    if (vin.length < 11) {
        frappe.msgprint({
            title: __('Invalid VIN'),
            message: __('VIN must be at least 11 characters long'),
            indicator: 'orange'
        });
        return;
    }
    
    // Show progress indicator
    frappe.dom.freeze(__('Decoding VIN from NHTSA database...'));
    
    // Call server-side method
    frappe.call({
        method: 'your_app.vehicles.api.decode_vin',
        args: {
            vin: vin,
            model_year: frm.doc.model_year || null
        },
        callback: function(response) {
            frappe.dom.unfreeze();
            
            if (response.message && response.message.success) {
                populate_vehicle_fields(frm, response.message.data);
                
                frappe.show_alert({
                    message: __('VIN decoded successfully! {0} {1} {2}', [
                        response.message.data.ModelYear || '',
                        response.message.data.Make || '',
                        response.message.data.Model || ''
                    ]),
                    indicator: 'green'
                }, 5);
                
            } else {
                frappe.msgprint({
                    title: __('Decoding Failed'),
                    message: response.message.message || __('Unable to decode VIN'),
                    indicator: 'red'
                });
            }
        },
        error: function(error) {
            frappe.dom.unfreeze();
            frappe.msgprint({
                title: __('Error'),
                message: __('Failed to connect to VIN decoder service. Please check your internet connection.'),
                indicator: 'red'
            });
            console.error('VIN Decode Error:', error);
        }
    });
}

function populate_vehicle_fields(frm, data) {
    // Comprehensive field mapping
    const mapping = {
        // Basic Information
        'make': 'Make',
        'model': 'Model',
        'model_year': 'ModelYear',
        'manufacturer_name': 'Manufacturer',
        
        // Vehicle Classification
        'vehicle_type': 'VehicleType',
        'body_class': 'BodyClass',
        'trim': 'Trim',
        'trim_2': 'Trim2',
        'series': 'Series',
        'series_2': 'Series2',
        
        // Engine Specifications
        'engine_number_of_cylinders': 'EngineCylinders',
        'displacement_cc': 'DisplacementCC',
        'displacement_ci': 'DisplacementCI',
        'displacement_l': 'DisplacementL',
        'engine_model': 'EngineModel',
        'engine_power_kw': 'EngineKW',
        'engine_configuration': 'EngineConfiguration',
        'engine_manufacturer': 'EngineManufacturer',
        'fuel_injection_type': 'FuelInjectionType',
        'turbo': 'Turbo',
        'valve_train_design': 'ValveTrainDesign',
        'cooling_type': 'CoolingType',
        
        // Fuel Information
        'fuel_type_primary': 'FuelTypePrimary',
        'fuel_type_secondary': 'FuelTypeSecondary',
        
        // Electric Vehicle Info
        'electrification_level': 'ElectrificationLevel',
        'battery_type': 'BatteryType',
        'battery_kwh_from': 'BatteryKWh_From',
        'battery_kwh_to': 'BatteryKWh_To',
        'ev_drive_unit': 'EVDriveUnit',
        'battery_cells': 'BatteryCells',
        'battery_modules': 'BatteryModules',
        'battery_packs': 'BatteryPacks',
        'charger_level': 'ChargerLevel',
        'charger_power_kw': 'ChargerPowerKW',
        
        // Transmission
        'transmission_style': 'TransmissionStyle',
        'transmission_speeds': 'TransmissionSpeeds',
        
        // Dimensions & Capacity
        'doors': 'Doors',
        'windows': 'Windows',
        'wheel_base_type': 'WheelBaseType',
        'wheel_base_short_inches': 'WheelBaseShort_inches',
        'wheel_base_long_inches': 'WheelBaseLong_inches',
        'gross_vehicle_weight_rating': 'GVWR',
        'gross_vehicle_weight_rating_from': 'GVWR_From',
        'gross_vehicle_weight_rating_to': 'GVWR_To',
        'curb_weight_lbs': 'CurbWeightLBS',
        'bed_length_inches': 'BedLength_inches',
        'cab_type': 'CabType',
        'track_width_inches': 'TrackWidth_inches',
        
        // Drive & Wheels
        'drive_type': 'DriveType',
        'axles': 'Axles',
        'axle_configuration': 'AxleConfiguration',
        'wheel_size_front': 'WheelSizeFront_inches',
        'wheel_size_rear': 'WheelSizeRear_inches',
        
        // Brakes & Safety Systems
        'brake_system_type': 'BrakeSystemType',
        'brake_system_desc': 'BrakeSystemDesc',
        'abs': 'ABS',
        'electronic_stability_control': 'ESC',
        'traction_control': 'TractionControl',
        'tire_pressure_monitoring_system': 'TPMS',
        
        // Safety Features
        'airbag_locations': 'AirBagLocFront',
        'seat_belts_all': 'SeatBeltsAll',
        'pretensioner': 'Pretensioner',
        
        // Entertainment & Interior
        'entertainment_system': 'EntertainmentSystem',
        'steering_location': 'SteeringLocation',
        'adaptive_cruise_control': 'AdaptiveCruiseControl',
        'adaptive_headlights': 'AdaptiveHeadlights',
        'adaptive_driving_beam': 'AdaptiveDrivingBeam',
        
        // Manufacturing Information
        'plant_city': 'PlantCity',
        'plant_state': 'PlantState',
        'plant_country': 'PlantCountry',
        'plant_company_name': 'PlantCompanyName',
        
        // VIN Information
        'wmi': 'WMI',
        'vehicle_descriptor': 'VehicleDescriptor',
        'check_digit': 'VINCheckDigit',
        'suggested_vin': 'SuggestedVIN',
        'error_code': 'ErrorCode',
        'error_text': 'ErrorText',
        
        // Market & Classification
        'destination_market': 'DestinationMarket',
        'ncsa_make': 'NCSAMake',
        'ncsa_model': 'NCSAModel',
        'ncsa_body_type': 'NCSABodyType',
        'ncsa_note': 'NCSANote',
        
        // Commercial Vehicle Specific
        'bus_length_feet': 'BusLength_feet',
        'bus_floor_config': 'BusFloorConfigType',
        'bus_type': 'BusType',
        'trailer_type': 'TrailerType',
        'trailer_body_type': 'TrailerBodyType',
        'trailer_length_feet': 'TrailerLength_feet',
        
        // Motorcycle Specific
        'motorcycle_suspension_type': 'MotorcycleSuspensionType',
        'motorcycle_chassis_type': 'MotorcycleChassisType',
        'motorcycle_brake_front': 'MotorcycleBrakeFront',
        'motorcycle_brake_rear': 'MotorcycleBrakeRear',
        'custom_motorcycle_type': 'CustomMotorcycleType',
        
        // Other Specifications
        'top_speed_mph': 'TopSpeedMPH',
        'seating_rows': 'SeatingRows',
        'displacement_description': 'DisplacementL',
        'other_engine_info': 'OtherEngineInfo',
        'note': 'Note',
    };
    
    // Track updated fields
    let updated_fields = [];
    
    // Populate fields
    for (let field_name in mapping) {
        let api_field = mapping[field_name];
        let value = data[api_field];
        
        // Skip empty or "Not Applicable" values
        if (!value || value === 'Not Applicable' || value === '' || value === 'null') {
            continue;
        }
        
        // Check if field exists in form
        if (frm.fields_dict[field_name]) {
            // Set the value
            frm.set_value(field_name, value);
            updated_fields.push(field_name);
        }
    }
    
    // Mark form as modified
    frm.dirty();
    
    // Log updated fields for debugging
    console.log('VIN Decoder: Updated ' + updated_fields.length + ' fields:', updated_fields);
    
    // Show summary
    if (updated_fields.length > 0) {
        frappe.show_alert({
            message: __('Updated {0} vehicle fields', [updated_fields.length]),
            indicator: 'blue'
        }, 3);
    }
}

function show_decode_indicator(frm) {
    // Add a visual indicator that VIN can be decoded
    frm.dashboard.add_indicator(__('VIN Ready to Decode'), 'blue');
}

// Optional: Add VIN format validation
frappe.ui.form.on('Vehicles', {
    validate: function(frm) {
        if (frm.doc.chassis_number) {
            const vin = frm.doc.chassis_number;
            
            // Basic VIN validation
            if (vin.length === 17) {
                // Full VIN - check for invalid characters
                const invalidChars = /[IOQioq]/;
                if (invalidChars.test(vin)) {
                    frappe.msgprint({
                        title: __('Invalid VIN'),
                        message: __('VIN cannot contain letters I, O, or Q'),
                        indicator: 'orange'
                    });
                    frappe.validated = false;
                }
            } else if (vin.length < 11) {
                frappe.msgprint({
                    title: __('Invalid VIN Length'),
                    message: __('VIN must be at least 11 characters'),
                    indicator: 'orange'
                });
                frappe.validated = false;
            }
        }
    }
});

// Add helper function to get specific make models
function get_models_for_make(frm) {
    if (!frm.doc.make) {
        frappe.msgprint(__('Please select a Make first'));
        return;
    }
    
    frappe.call({
        method: 'your_app.vehicles.api.get_models_for_make',
        args: {
            make: frm.doc.make,
            year: frm.doc.model_year
        },
        callback: function(r) {
            if (r.message && r.message.success) {
                // Could populate a select field or show in dialog
                console.log('Available models:', r.message.models);
            }
        }
    });
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
