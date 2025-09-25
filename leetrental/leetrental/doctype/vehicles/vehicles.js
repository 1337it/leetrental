// Copyright (c) 2022, Solufy and contributors
// For license information, please see license.txt

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
  method: 'leetrental.leetrental.vehicle_movements.vehicle_movements.get_vehicle_movements',
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
                <td><a class="bold" href="#Form/Vehicle Movement/${encodeURIComponent(r.name)}">${r.movement_id || r.name}</a></td>
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
