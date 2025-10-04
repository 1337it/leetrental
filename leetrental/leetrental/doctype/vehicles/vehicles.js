// Copyright (c) 2022, Solufy and contributors
// For license information, please see license.txt

// File: your_app/your_app/vehicles/vehicles.js
// Client Script for Vehicles DocType

frappe.ui.form.on('Vehicles', {
    // Add button to decode VIN
    refresh: function(frm) {
        if (frm.doc.chassis_number && !frm.is_new()) {
            frm.add_custom_button(__('Decode VIN'), function() {
                decode_vin(frm);
            }, __('Actions'));
        }
    },
    
    // Auto-decode when chassis number is entered
    chassis_number: function(frm) {
        if (frm.doc.chassis_number && frm.doc.chassis_number.length >= 11) {
            decode_vin(frm);
        }
    }
});

function decode_vin(frm) {
    const vin = frm.doc.chassis_number;
    
    if (!vin || vin.length < 11) {
        frappe.msgprint(__('Please enter a valid VIN/Chassis Number (at least 11 characters)'));
        return;
    }
    
    // Show loading indicator
    frappe.show_alert({
        message: __('Decoding VIN...'),
        indicator: 'blue'
    });
    
    // Optional: Add model year if available
    const modelYear = frm.doc.model_year || '';
    const apiUrl = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/${vin}?format=json&modelyear=${modelYear}`;
    
    // Make API call
    fetch(apiUrl)
        .then(response => response.json())
        .then(data => {
            if (data.Results && data.Results.length > 0) {
                const result = data.Results[0];
                
                // Check if VIN is valid
                if (result.ErrorCode && result.ErrorCode.includes('0')) {
                    populate_fields(frm, result);
                    frappe.show_alert({
                        message: __('VIN decoded successfully'),
                        indicator: 'green'
                    });
                } else {
                    frappe.msgprint({
                        title: __('Error'),
                        message: result.ErrorText || __('Unable to decode VIN'),
                        indicator: 'red'
                    });
                }
            }
        })
        .catch(error => {
            console.error('VIN Decode Error:', error);
            frappe.msgprint({
                title: __('Error'),
                message: __('Failed to decode VIN. Please check your internet connection.'),
                indicator: 'red'
            });
        });
}

function populate_fields(frm, data) {
    // Map API fields to your DocType fields
    // Customize these mappings based on your actual field names
    
    const fieldMapping = {
        // Basic Information
        'make': data.Make,
        'model': data.Model,
        'model_year': data.ModelYear,
        'manufacturer_name': data.Manufacturer,
        
        // Vehicle Details
        'vehicle_type': data.VehicleType,
        'body_class': data.BodyClass,
        'trim': data.Trim,
        'series': data.Series,
        
        // Engine Information
        'engine_number_of_cylinders': data.EngineCylinders,
        'displacement_cc': data.DisplacementCC,
        'displacement_l': data.DisplacementL,
        'engine_model': data.EngineModel,
        'engine_manufacturer': data.EngineManufacturer,
        'fuel_type_primary': data.FuelTypePrimary,
        'fuel_type_secondary': data.FuelTypeSecondary,
        
        // Transmission
        'transmission_style': data.TransmissionStyle,
        'transmission_speeds': data.TransmissionSpeeds,
        
        // Dimensions & Capacity
        'doors': data.Doors,
        'windows': data.Windows,
        'gross_vehicle_weight_rating': data.GVWR,
        'curb_weight_lbs': data.CurbWeightLBS,
        
        // Drive & Brake
        'drive_type': data.DriveType,
        'brake_system_type': data.BrakeSystemType,
        'abs': data.ABS,
        
        // Safety Features
        'airbag_locations': data.AirBagLocations,
        'electronic_stability_control': data.ESC,
        'traction_control': data.TractionControl,
        
        // Manufacturing
        'plant_city': data.PlantCity,
        'plant_country': data.PlantCountry,
        'plant_state': data.PlantState,
        'plant_company_name': data.PlantCompanyName,
        
        // Additional Info
        'ncsa_make': data.NCSAMake,
        'ncsa_model': data.NCSAModel,
        'ncsa_body_type': data.NCSABodyType,
        'seat_belts_all': data.SeatBeltsAll,
        'entertainment_system': data.EntertainmentSystem,
        'steering_location': data.SteeringLocation,
        
        // WMI & VIN Info
        'wmi': data.WMI,
        'vehicle_descriptor': data.VehicleDescriptor,
        'destination_market': data.DestinationMarket,
        
        // Commercial Vehicle Info
        'bus_length': data.BusLength,
        'bus_floor_configuration': data.BusFloorConfigBType,
        'bus_type': data.BusType,
        'trailer_type': data.TrailerType,
        'trailer_body_type': data.TrailerBodyType,
        'trailer_length': data.TrailerLength,
        
        // Other
        'other_engine_info': data.OtherEngineInfo,
        'turbo': data.Turbo,
        'top_speed_mph': data.TopSpeedMPH,
        'wheel_base_type': data.WheelBaseType,
        'track_width': data.TrackWidth,
        'gross_combination_weight_rating': data.GCWR,
        'bed_length': data.BedLength,
        'cab_type': data.CabType,
        'axles': data.Axles,
        'axle_configuration': data.AxleConfiguration,
        'motorcycle_suspension_type': data.MotorcycleSuspensionType,
        'motorcycle_chassis_type': data.MotorcycleChassisType,
        'custom_motorcycle_type': data.CustomMotorcycleType,
        'valve_train_design': data.ValveTrainDesign,
        'cooling_type': data.CoolingType,
        'electrification_level': data.ElectrificationLevel,
        'battery_info': data.BatteryInfo,
        'battery_type': data.BatteryType,
        'battery_kwh': data.BatteryKWh,
        'ev_drive_unit': data.EVDriveUnit,
        'charger_level': data.ChargerLevel,
        'charger_power_kw': data.ChargerPowerKW,
    };
    
    // Set field values
    Object.keys(fieldMapping).forEach(fieldName => {
        const value = fieldMapping[fieldName];
        if (value && value !== 'Not Applicable' && value !== '' && frm.fields_dict[fieldName]) {
            frm.set_value(fieldName, value);
        }
    });
    
    // Mark form as modified
    frm.dirty();
}

// Optional: Add validation to ensure VIN format
frappe.ui.form.on('Vehicles', {
    validate: function(frm) {
        const vin = frm.doc.chassis_number;
        if (vin && vin.length !== 17 && vin.length < 11) {
            frappe.msgprint(__('VIN should be either 17 characters (full VIN) or at least 11 characters (partial VIN)'));
            frappe.validated = false;
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
