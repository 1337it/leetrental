frappe.ui.form.on('Vehicle Movement', {
  refresh(frm) {
    set_title(frm);

    // Status inference
    if (frm.doc.out_datetime && !frm.doc.in_datetime) {
      frm.set_value('status', 'Out');
    } else if (frm.doc.out_datetime && frm.doc.in_datetime) {
      frm.set_value('status', 'Returned');
    }
  },

  vehicle: set_title,
  movement_type: set_title,

  out_datetime(frm) { set_title(frm); recompute_duration(frm); },
  in_datetime(frm) { recompute_duration(frm); },

  out_fuel_eighths(frm) { set_fuel_pct(frm, 'out'); },
  in_fuel_eighths(frm) { set_fuel_pct(frm, 'in'); },

  validate(frm) {
    // bound fuel 0..8
    ['out_fuel_eighths', 'in_fuel_eighths'].forEach(f => {
      const val = cint(frm.doc[f] || 0);
      if (val < 0 || val > 8) {
        frappe.msgprint(__('Fuel level must be between 0 and 8'));
        frappe.validated = false;
      }
    });

    // time order
    if (frm.doc.out_datetime && frm.doc.in_datetime) {
      if (frappe.datetime.get_diff(frm.doc.in_datetime, frm.doc.out_datetime) < 0) {
        frappe.msgprint(__('In Date/Time must be after Out Date/Time'));
        frappe.validated = false;
      }
    }

    // mileage progression unless correction
    if (!frm.doc.odometer_correction && frm.doc.in_mileage && frm.doc.out_mileage) {
      if (flt(frm.doc.in_mileage) <= flt(frm.doc.out_mileage)) {
        frappe.msgprint(__('KMs (In) should be greater than KMs (Out) (or tick "Odometer Correction?")'));
        frappe.validated = false;
      }
    }

    // correction guard + helpful note
    if (frm.doc.odometer_correction) {
      if (!frm.doc.odo_from || !frm.doc.odo_to) {
        frappe.msgprint(__('Please enter "Correction From" and "Correction To" values.'));
        frappe.validated = false;
      }
      if (!frm.doc.out_notes) {
        frm.set_value('out_notes',
          `FOR KILOMETER CORRECTION FROM ${frm.doc.odo_from || ''} TO ${frm.doc.odo_to || ''}`);
      }
    }

    // final recomputes
    set_fuel_pct(frm, 'out');
    set_fuel_pct(frm, 'in');
    recompute_duration(frm);
    set_title(frm);
  }
});

function set_title(frm) {
  const v = frm.doc.vehicle || '';
  const t = frm.doc.movement_type || '';
  const out_dt = frm.doc.out_datetime ? frappe.datetime.str_to_user(frm.doc.out_datetime) : '';
  frm.set_value('title', [t, v, out_dt].filter(Boolean).join(' | '));
}

function set_fuel_pct(frm, side) {
  const f = side === 'out' ? 'out_fuel_eighths' : 'in_fuel_eighths';
  const t = side === 'out' ? 'out_fuel_percent' : 'in_fuel_percent';
  const n = cint(frm.doc[f] || 0);
  const pct = Math.max(0, Math.min(8, n)) * 100.0 / 8.0;
  frm.set_value(t, flt(pct).toFixed(2));
}

function recompute_duration(frm) {
  if (frm.doc.out_datetime && frm.doc.in_datetime) {
    const mins = frappe.datetime.get_minute_diff(frm.doc.in_datetime, frm.doc.out_datetime);
    frm.set_value('duration_hours', (mins / 60.0).toFixed(2));
  } else {
    frm.set_value('duration_hours', 0);
  }
}
