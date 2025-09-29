// leetrental/leetrental/page/vehicles_kanban/vehicles_kanban.js

frappe.pages['vehicles-kanban'].on_page_load = function(wrapper) {
    new VehiclesKanban(wrapper);
};

class VehiclesKanban {
    constructor(wrapper) {
        this.wrapper = wrapper;
        this.page = frappe.ui.make_app_page({
            parent: wrapper,
            title: 'Vehicles Kanban',
            single_column: false
        });
        
        this.kanban_data = {};
        this.dragged_vehicle = null;
        this.filters = {};
        
        this.setup_toolbar();
        this.setup_kanban();
        this.load_data();
    }
    
    setup_toolbar() {
        const me = this;
        
        // Add refresh button
        this.page.add_button(__('Refresh'), () => {
            me.load_data();
        }, 'octicon octicon-sync');
        
        // Add new vehicle button
        this.page.add_button(__('New Vehicle'), () => {
            frappe.new_doc('Vehicles');
        }, 'octicon octicon-plus');
        
        // Add search field
        this.page.add_field({
            fieldname: 'search',
            fieldtype: 'Data',
            label: __('Search'),
            placeholder: __('Search vehicles...'),
            change: () => {
                const query = me.page.fields_dict.search.get_value();
                me.filter_vehicles(query);
            }
        });
        
        // Add location filter
        this.page.add_field({
            fieldname: 'location_filter',
            fieldtype: 'Link',
            label: __('Location'),
            options: 'Reservation Locations',
            change: () => {
                me.filters.location = me.page.fields_dict.location_filter.get_value();
                me.load_data(me.filters);
            }
        });
        
        // Add model filter
        this.page.add_field({
            fieldname: 'model_filter',
            fieldtype: 'Link',
            label: __('Model'),
            options: 'Vehicles Model',
            change: () => {
                me.filters.model = me.page.fields_dict.model_filter.get_value();
                me.load_data(me.filters);
            }
        });
        
        // Add clear filters button
        this.page.add_button(__('Clear Filters'), () => {
            me.page.fields_dict.search.set_value('');
            me.page.fields_dict.location_filter.set_value('');
            me.page.fields_dict.model_filter.set_value('');
            me.filters = {};
            me.load_data();
        }, 'octicon octicon-x');
        
        // Add statistics button
        this.page.add_menu_item(__('View Statistics'), () => {
            me.show_statistics();
        });
        
        // Add export button
        this.page.add_menu_item(__('Export Data'), () => {
            me.export_kanban_data();
        });
    }
    
    setup_kanban() {
        this.kanban_wrapper = $('<div class="vehicles-kanban-wrapper"></div>').appendTo(this.page.main);
        this.kanban_container = $('<div class="kanban-container"></div>').appendTo(this.kanban_wrapper);
    }
    
    load_data(filters = {}) {
        const me = this;
        
        frappe.call({
            method: 'leetrental.leetrental.api.vehicles_kanban.get_kanban_data',
            args: { filters: filters },
            freeze: true,
            freeze_message: __('Loading vehicles...'),
            callback: (r) => {
                if (r.message) {
                    me.kanban_data = r.message;
                    me.render_kanban();
                    me.show_summary();
                }
            },
            error: (r) => {
                frappe.msgprint({
                    title: __('Error Loading Data'),
                    message: __('Failed to load kanban data. Please check your connection and try again.'),
                    indicator: 'red'
                });
            }
        });
    }
    
    render_kanban() {
        this.kanban_container.empty();
        
        const states = Object.keys(this.kanban_data);
        
        if (states.length === 0) {
            this.kanban_container.html(`
                <div class="empty-kanban">
                    <div class="empty-kanban-icon">
                        <i class="fa fa-car fa-3x text-muted"></i>
                    </div>
                    <p class="text-muted">${__('No vehicles found')}</p>
                </div>
            `);
            return;
        }
        
        states.forEach(state => {
            const column_data = this.kanban_data[state];
            const column = this.create_column(state, column_data);
            this.kanban_container.append(column);
        });
        
        // Initialize tooltips
        this.kanban_container.find('[data-toggle="tooltip"]').tooltip();
    }
    
    create_column(state, data) {
        const me = this;
        const style_class = this.get_style_class(data.style);
        
        const column = $(`
            <div class="kanban-column" data-state="${state}">
                <div class="kanban-column-header ${style_class}">
                    <div class="column-title-wrapper">
                        <h4>${data.label}</h4>
                        <span class="badge badge-pill">${data.vehicles.length}</span>
                    </div>
                    <div class="column-actions">
                        <button class="btn btn-xs btn-default collapse-column" title="${__('Collapse')}">
                            <i class="fa fa-minus"></i>
                        </button>
                    </div>
                </div>
                <div class="kanban-column-body" data-state="${state}">
                    ${data.vehicles.length === 0 ? `<div class="empty-state">${__('No vehicles')}</div>` : ''}
                </div>
            </div>
        `);
        
        const column_body = column.find('.kanban-column-body');
        
        // Add vehicles to column
        data.vehicles.forEach(vehicle => {
            const card = this.create_vehicle_card(vehicle);
            column_body.append(card);
        });
        
        // Collapse/Expand functionality
        column.find('.collapse-column').on('click', function() {
            const $body = $(this).closest('.kanban-column').find('.kanban-column-body');
            const $icon = $(this).find('i');
            
            if ($body.is(':visible')) {
                $body.slideUp(200);
                $icon.removeClass('fa-minus').addClass('fa-plus');
                $(this).attr('title', __('Expand'));
            } else {
                $body.slideDown(200);
                $icon.removeClass('fa-plus').addClass('fa-minus');
                $(this).attr('title', __('Collapse'));
            }
        });
        
        // Setup drag and drop
        this.setup_drag_drop(column_body);
        
        return column;
    }
    
    create_vehicle_card(vehicle) {
        const me = this;
        
        const card = $(`
            <div class="kanban-card" 
                 draggable="true" 
                 data-vehicle="${vehicle.name}"
                 data-state="${vehicle.workflow_state || 'Draft'}">
                <div class="kanban-card-header">
                    <div class="vehicle-license">
                        <strong>${vehicle.license_plate || __('N/A')}</strong>
                    </div>
                    <div class="vehicle-actions">
                        <button class="btn btn-xs btn-default view-vehicle" title="${__('View Details')}" data-toggle="tooltip">
                            <i class="fa fa-eye"></i>
                        </button>
                        <button class="btn btn-xs btn-default edit-vehicle" title="${__('Quick Edit')}" data-toggle="tooltip">
                            <i class="fa fa-edit"></i>
                        </button>
                    </div>
                </div>
                <div class="kanban-card-body">
                    ${vehicle.image ? `
                    <div class="vehicle-image">
                        <img src="${vehicle.image}" alt="${vehicle.license_plate}" 
                             onerror="this.src='/assets/frappe/images/ui-states/empty-state.png'">
                    </div>
                    ` : ''}
                    <div class="vehicle-info">
                        <div class="info-row">
                            <span class="label">${__('Model')}:</span>
                            <span class="value">${vehicle.model || __('N/A')}</span>
                        </div>
                        <div class="info-row">
                            <span class="label">${__('Chassis')}:</span>
                            <span class="value" title="${vehicle.chassis_number || ''}">${this.truncate(vehicle.chassis_number, 15) || __('N/A')}</span>
                        </div>
                        ${vehicle.driver ? `
                        <div class="info-row">
                            <span class="label">${__('Driver')}:</span>
                            <span class="value">
                                <a href="/app/customer/${vehicle.driver}" onclick="event.stopPropagation();">
                                    ${vehicle.driver}
                                </a>
                            </span>
                        </div>
                        ` : ''}
                        ${vehicle.location ? `
                        <div class="info-row">
                            <span class="label">${__('Location')}:</span>
                            <span class="value">${vehicle.location}</span>
                        </div>
                        ` : ''}
                        <div class="info-row">
                            <span class="label">${__('Odometer')}:</span>
                            <span class="value">${vehicle.last_odometer_value || 0} km</span>
                        </div>
                    </div>
                </div>
                <div class="kanban-card-footer">
                    <span class="vehicle-tag">${vehicle.tags || ''}</span>
                    <span class="vehicle-meta">${vehicle.color || ''} ${vehicle.model_year ? '| ' + vehicle.model_year : ''}</span>
                </div>
            </div>
        `);
        
        // View vehicle details
        card.find('.view-vehicle').on('click', (e) => {
            e.stopPropagation();
            frappe.set_route('Form', 'Vehicles', vehicle.name);
        });
        
        // Quick edit
        card.find('.edit-vehicle').on('click', (e) => {
            e.stopPropagation();
            me.quick_edit_vehicle(vehicle.name);
        });
        
        // Click card to view
        card.on('click', () => {
            frappe.set_route('Form', 'Vehicles', vehicle.name);
        });
        
        // Setup drag events
        card.on('dragstart', (e) => {
            me.dragged_vehicle = {
                name: vehicle.name,
                from_state: vehicle.workflow_state || 'Draft',
                element: card
            };
            card.addClass('dragging');
            e.originalEvent.dataTransfer.effectAllowed = 'move';
            e.originalEvent.dataTransfer.setData('text/html', card.html());
        });
        
        card.on('dragend', () => {
            card.removeClass('dragging');
            $('.kanban-column-body').removeClass('drag-over');
        });
        
        return card;
    }
    
    setup_drag_drop(column_body) {
        const me = this;
        const target_state = column_body.data('state');
        
        column_body.on('dragover', (e) => {
            e.preventDefault();
            e.originalEvent.dataTransfer.dropEffect = 'move';
            column_body.addClass('drag-over');
        });
        
        column_body.on('dragleave', (e) => {
            // Only remove if leaving the column body itself
            if (e.target === column_body[0]) {
                column_body.removeClass('drag-over');
            }
        });
        
        column_body.on('drop', (e) => {
            e.preventDefault();
            column_body.removeClass('drag-over');
            
            if (me.dragged_vehicle) {
                me.handle_drop(target_state);
            }
        });
    }
    
    handle_drop(to_state) {
        const me = this;
        const vehicle = this.dragged_vehicle;
        
        if (vehicle.from_state === to_state) {
            frappe.show_alert({
                message: __('Vehicle is already in this state'),
                indicator: 'blue'
            }, 3);
            return;
        }
        
        // Call backend to check if transition is allowed and get required fields
        frappe.call({
            method: 'leetrental.leetrental.api.vehicles_kanban.move_vehicle',
            args: {
                vehicle_name: vehicle.name,
                from_state: vehicle.from_state,
                to_state: to_state
            },
            callback: (r) => {
                if (r.message && r.message.success) {
                    if (r.message.requires_input) {
                        me.show_transition_dialog(r.message);
                    } else {
                        me.complete_move(vehicle.name, vehicle.from_state, to_state, {});
                    }
                } else {
                    frappe.msgprint({
                        title: __('Transition Not Allowed'),
                        message: r.message.message || __('This transition is not allowed'),
                        indicator: 'red'
                    });
                }
            }
        });
    }
    
    show_transition_dialog(move_data) {
        const me = this;
        
        const dialog = new frappe.ui.Dialog({
            title: __('Complete Transition: {0} → {1}', [move_data.from_state, move_data.to_state]),
            fields: move_data.required_fields,
            size: 'large',
            primary_action_label: __('Complete Move'),
            primary_action: (values) => {
                me.complete_move(
                    move_data.vehicle,
                    move_data.from_state,
                    move_data.to_state,
                    values
                );
                dialog.hide();
            },
            secondary_action_label: __('Cancel'),
            secondary_action: () => {
                dialog.hide();
            }
        });
        
        dialog.show();
    }
    
    complete_move(vehicle_name, from_state, to_state, form_data) {
        const me = this;
        
        frappe.call({
            method: 'leetrental.leetrental.api.vehicles_kanban.complete_vehicle_move',
            args: {
                vehicle_name: vehicle_name,
                from_state: from_state,
                to_state: to_state,
                form_data: form_data
            },
            freeze: true,
            freeze_message: __('Moving vehicle...'),
            callback: (r) => {
                if (r.message && r.message.success) {
                    frappe.show_alert({
                        message: r.message.message,
                        indicator: 'green'
                    }, 5);
                    
                    // Show created documents
                    if (r.message.created_docs && r.message.created_docs.length > 0) {
                        me.show_created_documents(r.message.created_docs);
                    }
                    
                    // Reload kanban
                    me.load_data(me.filters);
                } else {
                    frappe.msgprint({
                        title: __('Error'),
                        message: r.message.message || __('Failed to move vehicle'),
                        indicator: 'red'
                    });
                }
            }
        });
    }
    
    show_created_documents(docs) {
        const doc_links = docs.map(doc => {
            const route = doc.doctype.toLowerCase().replace(/ /g, '-');
            return `<div style="margin: 5px 0;">
                <a href="/app/${route}/${doc.name}" target="_blank">
                    <i class="fa fa-external-link"></i> ${doc.doctype}: ${doc.name}
                </a>
            </div>`;
        }).join('');
        
        const d = new frappe.ui.Dialog({
            title: __('Documents Created'),
            fields: [
                {
                    fieldtype: 'HTML',
                    options: `
                        <div style="padding: 10px;">
                            <p><strong>${__('The following documents were created:')}</strong></p>
                            ${doc_links}
                        </div>
                    `
                }
            ],
            primary_action_label: __('Close'),
            primary_action: function() {
                d.hide();
            }
        });
        
        d.show();
    }
    
    filter_vehicles(query) {
        const me = this;
        
        if (!query || query.trim() === '') {
            // Show all cards
            $('.kanban-card').show();
            return;
        }
        
        frappe.call({
            method: 'leetrental.leetrental.api.vehicles_kanban.search_vehicles',
            args: { 
                query: query,
                filters: me.filters
            },
            callback: (r) => {
                if (r.message) {
                    const found_names = r.message.map(v => v.name);
                    
                    $('.kanban-card').each(function() {
                        const vehicle_name = $(this).data('vehicle');
                        if (found_names.includes(vehicle_name)) {
                            $(this).show();
                        } else {
                            $(this).hide();
                        }
                    });
                    
                    frappe.show_alert({
                        message: __('Found {0} vehicles', [found_names.length]),
                        indicator: 'blue'
                    }, 2);
                }
            }
        });
    }
    
    quick_edit_vehicle(vehicle_name) {
        frappe.call({
            method: 'frappe.client.get',
            args: {
                doctype: 'Vehicles',
                name: vehicle_name
            },
            callback: (r) => {
                if (r.message) {
                    const vehicle = r.message;
                    
                    const d = new frappe.ui.Dialog({
                        title: __('Quick Edit: {0}', [vehicle.license_plate]),
                        fields: [
                            {
                                fieldtype: 'Link',
                                fieldname: 'driver',
                                label: __('Driver'),
                                options: 'Customer',
                                default: vehicle.driver
                            },
                            {
                                fieldtype: 'Link',
                                fieldname: 'location',
                                label: __('Location'),
                                options: 'Reservation Locations',
                                default: vehicle.location
                            },
                            {
                                fieldtype: 'Float',
                                fieldname: 'last_odometer_value',
                                label: __('Odometer Value'),
                                default: vehicle.last_odometer_value
                            },
                            {
                                fieldtype: 'Link',
                                fieldname: 'tags',
                                label: __('Tags'),
                                options: 'Vehicle Tags',
                                default: vehicle.tags
                            }
                        ],
                        primary_action_label: __('Update'),
                        primary_action: (values) => {
                            frappe.call({
                                method: 'frappe.client.set_value',
                                args: {
                                    doctype: 'Vehicles',
                                    name: vehicle_name,
                                    fieldname: values
                                },
                                callback: () => {
                                    frappe.show_alert({
                                        message: __('Vehicle updated'),
                                        indicator: 'green'
                                    });
                                    d.hide();
                                    this.load_data(this.filters);
                                }
                            });
                        }
                    });
                    
                    d.show();
                }
            }
        });
    }
    
    show_summary() {
        const total = Object.values(this.kanban_data).reduce((sum, state) => sum + state.vehicles.length, 0);
        const states = Object.keys(this.kanban_data).length;
        
        this.page.set_title_sub(`${total} vehicles in ${states} states`);
    }
    
    show_statistics() {
        const stats = {};
        let total = 0;
        
        Object.keys(this.kanban_data).forEach(state => {
            const count = this.kanban_data[state].vehicles.length;
            stats[state] = count;
            total += count;
        });
        
        const stats_html = Object.keys(stats).map(state => {
            const percentage = total > 0 ? ((stats[state] / total) * 100).toFixed(1) : 0;
            return `
                <tr>
                    <td>${state}</td>
                    <td class="text-right">${stats[state]}</td>
                    <td class="text-right">${percentage}%</td>
                </tr>
            `;
        }).join('');
        
        const d = new frappe.ui.Dialog({
            title: __('Kanban Statistics'),
            fields: [
                {
                    fieldtype: 'HTML',
                    options: `
                        <table class="table table-bordered">
                            <thead>
                                <tr>
                                    <th>${__('State')}</th>
                                    <th class="text-right">${__('Count')}</th>
                                    <th class="text-right">${__('Percentage')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${stats_html}
                            </tbody>
                            <tfoot>
                                <tr>
                                    <th>${__('Total')}</th>
                                    <th class="text-right">${total}</th>
                                    <th class="text-right">100%</th>
                                </tr>
                            </tfoot>
                        </table>
                    `
                }
            ]
        });
        
        d.show();
    }
    
    export_kanban_data() {
        const data = [];
        
        Object.keys(this.kanban_data).forEach(state => {
            this.kanban_data[state].vehicles.forEach(vehicle => {
                data.push({
                    'License Plate': vehicle.license_plate,
                    'Model': vehicle.model,
                    'Chassis Number': vehicle.chassis_number,
                    'State': state,
                    'Driver': vehicle.driver || '',
                    'Location': vehicle.location || '',
                    'Odometer': vehicle.last_odometer_value || 0
                });
            });
        });
        
        frappe.tools.downloadify(data, ['License Plate', 'Model', 'Chassis Number', 'State', 'Driver', 'Location', 'Odometer'], 'Vehicles Kanban Data');
        
        frappe.show_alert({
            message: __('Data exported successfully'),
            indicator: 'green'
        });
    }
    
    get_style_class(style) {
        const style_map = {
            'Success': 'bg-success',
            'Danger': 'bg-danger',
            'Warning': 'bg-warning',
            'Info': 'bg-info',
            'Primary': 'bg-primary'
        };
        return style_map[style] || 'bg-default';
    }
    
    truncate(str, length) {
        if (!str) return '';
        return str.length > length ? str.substring(0, length) + '...' : str;
    }
}
