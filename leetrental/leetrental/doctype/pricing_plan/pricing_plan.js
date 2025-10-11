// Copyright (c) 2024, LeetRental and contributors
// For license information, please see license.txt

frappe.ui.form.on('Pricing Plan', {
	refresh: function(frm) {
		// Add custom buttons
		if (!frm.is_new()) {
			frm.add_custom_button(__('Calculate Sample Rate'), function() {
				calculate_sample_rate(frm);
			});
			
			frm.add_custom_button(__('Preview Pricing'), function() {
				preview_pricing(frm);
			});
		}
		
		// Set indicators
		if (frm.doc.is_active) {
			frm.page.set_indicator(__('Active'), 'green');
		} else {
			frm.page.set_indicator(__('Inactive'), 'red');
		}
	},
	
	daily_rate: function(frm) {
		suggest_weekly_monthly_rates(frm);
	},
	
	weekly_rate: function(frm) {
		validate_weekly_rate(frm);
	},
	
	monthly_rate: function(frm) {
		validate_monthly_rate(frm);
	},
	
	mileage_included_per_day: function(frm) {
		if (frm.doc.mileage_included_per_day && !frm.doc.extra_km_rate) {
			frappe.msgprint({
				title: __('Suggestion'),
				message: __('Consider setting an Extra KM Rate for mileage overages'),
				indicator: 'blue'
			});
		}
	}
});

function suggest_weekly_monthly_rates(frm) {
	if (!frm.doc.daily_rate) return;
	
	// Suggest 15% discount for weekly
	let suggested_weekly = frm.doc.daily_rate * 7 * 0.85;
	
	// Suggest 30% discount for monthly
	let suggested_monthly = frm.doc.daily_rate * 30 * 0.70;
	
	frappe.msgprint({
		title: __('Rate Suggestions'),
		message: __('Suggested Weekly Rate (15% discount): {0}<br>Suggested Monthly Rate (30% discount): {1}', 
			[format_currency(suggested_weekly), format_currency(suggested_monthly)]),
		indicator: 'blue'
	});
}

function validate_weekly_rate(frm) {
	if (!frm.doc.weekly_rate || !frm.doc.daily_rate) return;
	
	let weekly_vs_daily = frm.doc.weekly_rate / (frm.doc.daily_rate * 7);
	
	if (weekly_vs_daily > 1) {
		frappe.msgprint({
			title: __('Warning'),
			message: __('Weekly rate is {0}% more expensive than daily rate. Consider offering a discount.', 
				[((weekly_vs_daily - 1) * 100).toFixed(1)]),
			indicator: 'orange'
		});
	} else {
		let discount = ((1 - weekly_vs_daily) * 100).toFixed(1);
		frm.dashboard.add_comment(__('Weekly discount: {0}%', [discount]), 'blue', true);
	}
}

function validate_monthly_rate(frm) {
	if (!frm.doc.monthly_rate || !frm.doc.daily_rate) return;
	
	let monthly_vs_daily = frm.doc.monthly_rate / (frm.doc.daily_rate * 30);
	
	if (monthly_vs_daily > 1) {
		frappe.msgprint({
			title: __('Warning'),
			message: __('Monthly rate is {0}% more expensive than daily rate. Consider offering a discount.', 
				[((monthly_vs_daily - 1) * 100).toFixed(1)]),
			indicator: 'orange'
		});
	} else {
		let discount = ((1 - monthly_vs_daily) * 100).toFixed(1);
		frm.dashboard.add_comment(__('Monthly discount: {0}%', [discount]), 'blue', true);
	}
}

function calculate_sample_rate(frm) {
	frappe.prompt([
		{
			label: __('Number of Days'),
			fieldname: 'days',
			fieldtype: 'Int',
			reqd: 1,
			default: 7
		},
		{
			label: __('Total KM to Travel'),
			fieldname: 'total_km',
			fieldtype: 'Float',
			default: 0
		}
	], function(values) {
		frappe.call({
			method: 'frappe.client.get',
			args: {
				doctype: 'Pricing Plan',
				name: frm.doc.name
			},
			callback: function(r) {
				if (r.message) {
					let plan = r.message;
					let result = calculate_rental_cost(plan, values.days, values.total_km);
					
					show_calculation_result(result, values.days, values.total_km);
				}
			}
		});
	}, __('Calculate Sample Rate'), __('Calculate'));
}

function calculate_rental_cost(plan, days, total_km) {
	let rates = [];
	
	// Daily calculation
	if (plan.daily_rate) {
		rates.push({
			type: 'Daily Rate',
			total: plan.daily_rate * days,
			per_day: plan.daily_rate
		});
	}
	
	// Weekly calculation
	if (plan.weekly_rate && days >= 7) {
		let weeks = Math.floor(days / 7);
		let remaining_days = days % 7;
		let total = weeks * plan.weekly_rate;
		if (plan.daily_rate && remaining_days > 0) {
			total += remaining_days * plan.daily_rate;
		}
		rates.push({
			type: 'Weekly Rate',
			total: total,
			per_day: total / days
		});
	}
	
	// Monthly calculation
	if (plan.monthly_rate && days >= 30) {
		let months = Math.floor(days / 30);
		let remaining_days = days % 30;
		let total = months * plan.monthly_rate;
		if (plan.daily_rate && remaining_days > 0) {
			total += remaining_days * plan.daily_rate;
		}
		rates.push({
			type: 'Monthly Rate',
			total: total,
			per_day: total / days
		});
	}
	
	// Find best rate
	let best_rate = rates.reduce((min, rate) => rate.total < min.total ? rate : min, rates[0]);
	
	// Calculate mileage charges
	let mileage_charge = 0;
	let included_km = 0;
	let extra_km = 0;
	
	if (plan.mileage_included_per_day && plan.extra_km_rate && total_km > 0) {
		included_km = plan.mileage_included_per_day * days;
		extra_km = Math.max(0, total_km - included_km);
		mileage_charge = extra_km * plan.extra_km_rate;
	}
	
	return {
		rates: rates,
		best_rate: best_rate,
		mileage_charge: mileage_charge,
		included_km: included_km,
		extra_km: extra_km,
		total: best_rate.total + mileage_charge
	};
}

function show_calculation_result(result, days, total_km) {
	let message = '<table class="table table-bordered">';
	message += '<tr><th>Rate Type</th><th>Total</th><th>Per Day</th></tr>';
	
	result.rates.forEach(rate => {
		let row_class = rate.type === result.best_rate.type ? 'success' : '';
		message += `<tr class="${row_class}">
			<td>${rate.type}</td>
			<td>${format_currency(rate.total)}</td>
			<td>${format_currency(rate.per_day)}</td>
		</tr>`;
	});
	
	message += '</table>';
	message += `<p><strong>Best Rate: ${result.best_rate.type}</strong></p>`;
	
	if (total_km > 0) {
		message += '<hr>';
		message += `<p><strong>Mileage Details:</strong></p>`;
		message += `<p>Included KM: ${result.included_km.toFixed(2)}</p>`;
		message += `<p>Extra KM: ${result.extra_km.toFixed(2)}</p>`;
		message += `<p>Mileage Charge: ${format_currency(result.mileage_charge)}</p>`;
	}
	
	message += '<hr>';
	message += `<h4>Total Cost: ${format_currency(result.total)}</h4>`;
	message += `<p>Average per day: ${format_currency(result.total / days)}</p>`;
	
	frappe.msgprint({
		title: __('Rate Calculation for {0} days', [days]),
		message: message,
		indicator: 'green',
		wide: true
	});
}

function preview_pricing(frm) {
	let days_options = [1, 3, 7, 14, 30, 60, 90];
	let message = '<table class="table table-bordered">';
	message += '<tr><th>Duration</th><th>Best Rate</th><th>Total Cost</th><th>Per Day</th></tr>';
	
	days_options.forEach(days => {
		let result = calculate_rental_cost(frm.doc, days, 0);
		if (result.best_rate) {
			message += `<tr>
				<td>${days} day${days > 1 ? 's' : ''}</td>
				<td>${result.best_rate.type}</td>
				<td>${format_currency(result.best_rate.total)}</td>
				<td>${format_currency(result.best_rate.per_day)}</td>
			</tr>`;
		}
	});
	
	message += '</table>';
	
	frappe.msgprint({
		title: __('Pricing Preview'),
		message: message,
		indicator: 'blue',
		wide: true
	});
}