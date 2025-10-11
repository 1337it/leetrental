# Copyright (c) 2022, Solufy and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class Vehicles(Document):
	pass

@frappe.whitelist()
def update_odometer(docname):
	top = docname
	data = frappe.db.sql("""
		SELECT
		SUM(odometer_value) from `tabOdometers`
        where
		vehicle = %s
		""", (top,))
	p = data[0][0]
	return p

