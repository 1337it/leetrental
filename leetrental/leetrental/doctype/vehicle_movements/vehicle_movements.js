// Copyright (c) 2022, Solufy and contributors
// For license information, please see license.txt

frappe.ui.form.on('Vehicle Movements', {
	// refresh: function(frm) {
// in your doctype JS or app_include_js
  refresh(frm) {
    // optional: still keep standard query rules
    frm.set_query('Vehicles', () => {
      return {
        filters: { disabled: 0 }
      };
    });

    // Add a suffix icon to open advanced picker
    const f = frm.get_field('Vehicles');
    if (!f?.$input) return;

    // Add button once
    if (f.$wrapper.find('.adv-link-btn').length === 0) {
      const $btn = $(`<span class="adv-link-btn" title="Advanced search" style="cursor:pointer;margin-left:6px">
        <i class="fa fa-search"></i>
      </span>`);
      f.$wrapper.find('.control-input').append($btn);

      $btn.on('click', () => {
        openAdvancedLinkPicker({
          doctype: 'Vehicles',
          targetField: 'Vehicle',
          frm,
          columns: [
            { key: 'chassis_number', label: 'Chassis Number', width: '30%' },
            { key: 'id', label: 'id', width: '50%' },
            { key: 'model', label: 'model', width: '20%' },
          ],
          staticFilters: { disabled: 0 },
          makeNew: true,
          pageLen: 20,
        });
      });
    }
  }
});
	// }
});
