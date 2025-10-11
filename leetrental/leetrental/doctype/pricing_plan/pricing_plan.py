# -*- coding: utf-8 -*-
# Copyright (c) 2024, LeetRental and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe.model.document import Document

class PricingPlan(Document):
	def validate(self):
		"""Validate pricing plan data"""
		self.validate_rates()
		self.validate_mileage_rates()
	
	def validate_rates(self):
		"""Ensure rates are positive and logical"""
		if self.daily_rate and self.daily_rate <= 0:
			frappe.throw("Daily Rate must be greater than zero")
		
		# Weekly rate should be less than 7 times daily rate (discount expected)
		if self.weekly_rate and self.daily_rate:
			if self.weekly_rate > (self.daily_rate * 7):
				frappe.msgprint(
					"Weekly rate is higher than 7 times the daily rate. Consider offering a discount.",
					indicator="orange",
					alert=True
				)
		
		# Monthly rate should be less than 30 times daily rate (discount expected)
		if self.monthly_rate and self.daily_rate:
			if self.monthly_rate > (self.daily_rate * 30):
				frappe.msgprint(
					"Monthly rate is higher than 30 times the daily rate. Consider offering a discount.",
					indicator="orange",
					alert=True
				)
	
	def validate_mileage_rates(self):
		"""Validate mileage-related fields"""
		if self.mileage_included_per_day and self.mileage_included_per_day < 0:
			frappe.throw("Mileage Included Per Day cannot be negative")
		
		if self.extra_km_rate and self.extra_km_rate < 0:
			frappe.throw("Extra KM Rate cannot be negative")
		
		# If extra km rate is set, mileage included should also be set
		if self.extra_km_rate and not self.mileage_included_per_day:
			frappe.msgprint(
				"Consider setting Mileage Included Per Day when Extra KM Rate is defined",
				indicator="blue",
				alert=True
			)
	
	def get_rate_for_duration(self, days):
		"""
		Calculate the best rate for a given number of days
		Returns the most economical rate option
		"""
		rates = []
		
		# Daily rate calculation
		if self.daily_rate:
			rates.append({
				'type': 'Daily',
				'total': self.daily_rate * days,
				'per_day': self.daily_rate
			})
		
		# Weekly rate calculation
		if self.weekly_rate and days >= 7:
			weeks = days // 7
			remaining_days = days % 7
			total = (weeks * self.weekly_rate)
			if self.daily_rate and remaining_days > 0:
				total += (remaining_days * self.daily_rate)
			rates.append({
				'type': 'Weekly',
				'total': total,
				'per_day': total / days
			})
		
		# Monthly rate calculation
		if self.monthly_rate and days >= 30:
			months = days // 30
			remaining_days = days % 30
			total = (months * self.monthly_rate)
			if self.daily_rate and remaining_days > 0:
				total += (remaining_days * self.daily_rate)
			rates.append({
				'type': 'Monthly',
				'total': total,
				'per_day': total / days
			})
		
		# Return the most economical option
		if rates:
			return min(rates, key=lambda x: x['total'])
		
		return None
	
	def calculate_mileage_charges(self, total_km, rental_days):
		"""
		Calculate extra mileage charges
		"""
		if not self.mileage_included_per_day or not self.extra_km_rate:
			return 0
		
		included_km = self.mileage_included_per_day * rental_days
		extra_km = max(0, total_km - included_km)
		
		return extra_km * self.extra_km_rate