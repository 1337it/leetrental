# Copyright (c) 2024, Leet Rental and Contributors
# See license.txt

import frappe
from frappe.tests.utils import FrappeTestCase
from frappe.utils import add_days, nowdate


class TestInsurancePolicy(FrappeTestCase):
	def setUp(self):
		# Create test vehicle if it doesn't exist
		if not frappe.db.exists("Vehicle", "TEST-VEH-001"):
			vehicle = frappe.get_doc({
				"doctype": "Vehicle",
				"license_plate": "TEST-VEH-001",
				"make": "Test Make",
				"model": "Test Model",
				"year": 2024
			})
			vehicle.insert()

	def test_policy_creation(self):
		"""Test basic policy creation"""
		policy = frappe.get_doc({
			"doctype": "Insurance Policy",
			"vehicle": "TEST-VEH-001",
			"policy_no": "POL-TEST-001",
			"insurer": "Test Insurance Co.",
			"coverage_type": "Comprehensive",
			"start_date": nowdate(),
			"end_date": add_days(nowdate(), 365)
		})
		policy.insert()
		
		self.assertEqual(policy.status, "Active")
		policy.delete()

	def test_expiring_soon_status(self):
		"""Test expiring soon status (≤30 days)"""
		policy = frappe.get_doc({
			"doctype": "Insurance Policy",
			"vehicle": "TEST-VEH-001",
			"policy_no": "POL-TEST-002",
			"insurer": "Test Insurance Co.",
			"coverage_type": "Comprehensive",
			"start_date": add_days(nowdate(), -335),
			"end_date": add_days(nowdate(), 30)
		})
		policy.insert()
		
		self.assertEqual(policy.status, "Expiring Soon")
		indicator = policy.get_indicator()
		self.assertEqual(indicator[1], "red")
		policy.delete()

	def test_expired_status(self):
		"""Test expired status"""
		policy = frappe.get_doc({
			"doctype": "Insurance Policy",
			"vehicle": "TEST-VEH-001",
			"policy_no": "POL-TEST-003",
			"insurer": "Test Insurance Co.",
			"coverage_type": "Comprehensive",
			"start_date": add_days(nowdate(), -400),
			"end_date": add_days(nowdate(), -35)
		})
		policy.insert()
		
		self.assertEqual(policy.status, "Expired")
		indicator = policy.get_indicator()
		self.assertEqual(indicator[1], "red")
		policy.delete()

	def test_date_validation(self):
		"""Test that end_date cannot be before start_date"""
		policy = frappe.get_doc({
			"doctype": "Insurance Policy",
			"vehicle": "TEST-VEH-001",
			"policy_no": "POL-TEST-004",
			"insurer": "Test Insurance Co.",
			"coverage_type": "Comprehensive",
			"start_date": nowdate(),
			"end_date": add_days(nowdate(), -1)
		})
		
		with self.assertRaises(frappe.ValidationError):
			policy.insert()

	def tearDown(self):
		# Clean up test data
		frappe.db.rollback()