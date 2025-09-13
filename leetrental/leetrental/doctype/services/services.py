# Copyright (c) 2022, Solufy and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document

class Services(Document):
	pass

def validate(self,cdt):
	if self.workflow_state == "Done":
		date = self.date	
		vehicle = self.vehicle
		driver = self.driver
		odometer_value = self.odometer_value
		
		vals = frappe.get_doc({
			"doctype": "Odometers",
			"date": date,
			"vehicle": vehicle,
			"driver": driver,
			"odometer_value": odometer_value,
		})
		vals.insert()