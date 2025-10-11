# -*- coding: utf-8 -*-
# Copyright (c) 2024, LeetRental and Contributors
# See license.txt
from __future__ import unicode_literals

import frappe
import unittest

class TestPricingPlan(unittest.TestCase):
	def setUp(self):
		"""Create test pricing plan"""
		if not frappe.db.exists("Pricing Plan", "Test Plan - Sedan"):
			self.plan = frappe.get_doc({
				"doctype": "Pricing Plan",
				"plan_name": "Test Plan - Sedan",
				"vehicle_type": "Sedan",
				"daily_rate": 100,
				"weekly_rate": 600,
				"monthly_rate": 2100,
				"mileage_included_per_day": 100,
				"extra_km_rate": 0.50,
				"is_active": 1
			}).insert()
		else:
			self.plan = frappe.get_doc("Pricing Plan", "Test Plan - Sedan")
	
	def tearDown(self):
		"""Clean up test data"""
		if frappe.db.exists("Pricing Plan", "Test Plan - Sedan"):
			frappe.delete_doc("Pricing Plan", "Test Plan - Sedan")
	
	def test_pricing_plan_creation(self):
		"""Test that pricing plan is created successfully"""
		self.assertEqual(self.plan.plan_name, "Test Plan - Sedan")
		self.assertEqual(self.plan.vehicle_type, "Sedan")
		self.assertEqual(self.plan.daily_rate, 100)
	
	def test_rate_calculation_daily(self):
		"""Test daily rate calculation"""
		result = self.plan.get_rate_for_duration(3)
		self.assertEqual(result['total'], 300)
		self.assertEqual(result['type'], 'Daily')
	
	def test_rate_calculation_weekly(self):
		"""Test weekly rate calculation"""
		result = self.plan.get_rate_for_duration(7)
		# Weekly rate (600) should be less than daily rate (700)
		self.assertEqual(result['total'], 600)
		self.assertEqual(result['type'], 'Weekly')
	
	def test_rate_calculation_monthly(self):
		"""Test monthly rate calculation"""
		result = self.plan.get_rate_for_duration(30)
		# Monthly rate (2100) should be less than daily rate (3000)
		self.assertEqual(result['total'], 2100)
		self.assertEqual(result['type'], 'Monthly')
	
	def test_mileage_charges(self):
		"""Test mileage charge calculation"""
		# 5 days rental, 100km/day included = 500km included
		# 700km total - 500km included = 200km extra
		# 200km * 0.50 = 100 extra charge
		extra_charge = self.plan.calculate_mileage_charges(700, 5)
		self.assertEqual(extra_charge, 100)
	
	def test_no_extra_mileage_charges(self):
		"""Test when mileage is within limit"""
		extra_charge = self.plan.calculate_mileage_charges(400, 5)
		self.assertEqual(extra_charge, 0)
	
	def test_validation_negative_rate(self):
		"""Test that negative rates are not allowed"""
		plan = frappe.get_doc({
			"doctype": "Pricing Plan",
			"plan_name": "Invalid Plan",
			"vehicle_type": "SUV",
			"daily_rate": -50
		})
		with self.assertRaises(frappe.ValidationError):
			plan.insert()