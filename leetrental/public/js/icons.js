frappe.provide("car_rental_icons");

// Get icon path
car_rental_icons.get_icon = function(icon_name) {
    return `/assets/your_app/icons/${icon_name}.svg`;
};

// Get icon HTML
car_rental_icons.get_html = function(icon_name, size = 'md', color = '') {
    let icon_url = car_rental_icons.get_icon(icon_name);
    let color_class = color ? `icon-${color}` : '';
    return `<img src="${icon_url}" class="icon icon-${size} ${color_class}" alt="${icon_name}">`;
};

// Add icon to element
car_rental_icons.add_to = function(element, icon_name, size = 'md') {
    if (typeof element === 'string') {
        element = document.querySelector(element);
    }
    if (element) {
        element.innerHTML = car_rental_icons.get_html(icon_name, size);
    }
};

// Available icons for car rental
car_rental_icons.list = [
    'car',
    'suv',
    'luxury-car',
    'electric-car',
    'car-key',
    'booking',
    'calendar',
    'driver',
    'license',
    'insurance',
    'maintenance',
    'fuel',
    'payment',
    'location',
    'gps',
    'customer',
    'invoice',
    'contract',
    'damage-report',
    'car-wash'
];
