# Copyright (c) 2022, Solufy and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _


class CarReservations(Document):
	pass


def validate(self,cdt):
	if self.workflow_state == "Done":
		vehicle1 = self.vehicle	
		driver1 = self.driver
		approver1 = self.approver
		start_date1 = self.start_time
		end_date1 = self.end_time
		pickup_location1 = self.pickup_location
		drop_location1 = self.drop_location
		kilometer_distance1 = self.kilometer_distance
		
		vals = frappe.get_doc({
			"doctype": "Driver History",
			"vehicle": vehicle1,
			"driver": driver1,
			"approver": approver1,
			"start_date": start_date1,
			"end_date": end_date1,
			"pickup_location": pickup_location1,
			"drop_location": drop_location1,
			"kilometer_distance": kilometer_distance1
		})
		vals.insert()
		vals = frappe.get_doc({
			"doctype": "Odometers",
			"vehicle": vehicle1,
			"driver": driver1,
			"pickup_location": pickup_location1,
			"drop_location": drop_location1,
			"odometer_value": kilometer_distance1
		})
		vals.insert()

		if vehicle1:
			frappe.db.set_value("Vehicles", vehicle1, "workflow_state", "Registered")

	if self.workflow_state == "Reserved":
		vehicle_name = self.vehicle
		if vehicle_name:
			frappe.db.set_value("Vehicles", vehicle_name, "workflow_state", "Reserve")


def validate(doc, method):
    # Check if there are existing reservations for the same car and period
    conflicting_reservations = frappe.get_all('leetrental',
                                              filters={'vehicle': doc.vehicle,
                                                       'name': ['!=', doc.name],
                                                       'end_time': ['>=', doc.start_time],
                                                       'start_time': ['<=', doc.end_time]})
    if conflicting_reservations:
        frappe.throw(_('Conflicting reservations found. Please choose a different car or adjust the reservation dates.'))


