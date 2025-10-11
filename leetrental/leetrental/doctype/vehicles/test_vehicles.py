# Copyright (c) 2024, LeetRental and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase


class TestVehicles(FrappeTestCase):
	def setUp(self):
		"""Set up test data"""
		# Create test vehicle if it doesn't exist
		if not frappe.db.exists("Vehicles", "TEST-001"):
			self.test_vehicle = frappe.get_doc({
				"doctype": "Vehicles",
				"license_plate": "TEST-001",
				"chassis_number": "TEST-CHASSIS-001",
				"custom_engine_number": "TEST-ENGINE-001",
				"model_year": 2023,
				"transmission": "Automatic",
				"fuel_type": "Gasoline"
			}).insert()
		else:
			self.test_vehicle = frappe.get_doc("Vehicles", "TEST-001")
	
	def test_vehicle_creation(self):
		"""Test basic vehicle creation"""
		vehicle = frappe.get_doc({
			"doctype": "Vehicles",
			"license_plate": "TEST-002",
			"chassis_number": "TEST-CHASSIS-002",
			"custom_engine_number": "TEST-ENGINE-002",
			"model_year": 2023
		})
		vehicle.insert()
		
		self.assertEqual(vehicle.license_plate, "TEST-002")
		self.assertEqual(vehicle.chassis_number, "TEST-CHASSIS-002")
		
		# Cleanup
		vehicle.delete()
	
	def test_duplicate_chassis_number(self):
		"""Test that duplicate chassis numbers are not allowed"""
		with self.assertRaises(frappe.ValidationError):
			vehicle = frappe.get_doc({
				"doctype": "Vehicles",
				"license_plate": "TEST-003",
				"chassis_number": "TEST-CHASSIS-001",  # Duplicate
				"custom_engine_number": "TEST-ENGINE-003",
				"model_year": 2023
			})
			vehicle.insert()
	
	def test_model_year_validation(self):
		"""Test model year validation"""
		from datetime import datetime
		
		# Test future year (should fail)
		with self.assertRaises(frappe.ValidationError):
			vehicle = frappe.get_doc({
				"doctype": "Vehicles",
				"license_plate": "TEST-004",
				"chassis_number": "TEST-CHASSIS-004",
				"custom_engine_number": "TEST-ENGINE-004",
				"model_year": datetime.now().year + 5
			})
			vehicle.insert()
	
	def tearDown(self):
		"""Clean up test data"""
		# Keep the test vehicle for other tests
		pass