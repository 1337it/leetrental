# Copyright (c) 2024, Leet Rental and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import getdate, date_diff, nowdate


class InsurancePolicy(Document):
	def validate(self):
		self.validate_dates()
		self.set_status()

	def validate_dates(self):
		"""Validate that end_date is after start_date"""
		if self.start_date and self.end_date:
			if getdate(self.end_date) < getdate(self.start_date):
				frappe.throw("End Date cannot be before Start Date")

	def set_status(self):
		"""Set status based on expiration date"""
		if self.end_date:
			days_to_expiry = date_diff(self.end_date, nowdate())
			
			if days_to_expiry < 0:
				self.status = "Expired"
			elif days_to_expiry <= 30:
				self.status = "Expiring Soon"
			else:
				self.status = "Active"

	def get_indicator(self):
		"""Return indicator color based on expiration status"""
		if self.end_date:
			days_to_expiry = date_diff(self.end_date, nowdate())
			
			if days_to_expiry < 0:
				return ["Expired", "red", "status,=,Expired"]
			elif days_to_expiry <= 30:
				return ["Expiring Soon", "red", "status,=,Expiring Soon"]
			else:
				return ["Active", "green", "status,=,Active"]
		
		return ["Unknown", "gray", ""]