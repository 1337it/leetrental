# Copyright (c) 2022, Solufy and contributors
# For license information, please see license.txt

from __future__ import unicode_literals
import frappe
from frappe import _

def execute(filters=None):
	columns = get_report_columns()
	data = get_report_data(filters)
	return columns, data
	
def get_report_columns():	
	columns = [{
		"fieldname": "name",
		"label": _("Name"),
		"fieldtype": "Data",
		"options": "",
		"width": 150
		},
		{
		"fieldname": "vehicle",
		"label": _("Vehicle"),
		"fieldtype": "Link",
		"options": "Vehicle",
		"width": 200
		},
		{
		"fieldname": "service_type",
		"label": _("Service Type"),
		"fieldtype": "Link",
		"options": "Service Types",
		"width": 150
		},
		{
		"fieldname": "date",
		"label": _("Date"),
		"fieldtype": "date",
		"options": "",
		"width": 150
		},
		{
		"fieldname": "odometer_value",
		"label": _("Odometer Value"),
		"fieldtype": "Float",
		"options": "",
		"width": 150
		},
		{
		"fieldname": "cost",
		"label": _("Cost"),
		"fieldtype": "Float",
		"options": "",
		"width": 150
		},
		{
		"fieldname": "workflow_state",
		"label": _("Status"),
		"fieldtype": "Data",
		"options": "",
		"width": 200
		},
	]
	return columns

def get_report_data(filters=None):
	data = get_orders(filters)
	return data

def get_orders(filters):
	#additional_conditions = get_additional_report_conditions(filters)
	test_q = """select name,vehicle,service_type,date,odometer_value,cost,workflow_state \
		from `tabServices`"""
	return frappe.db.sql(test_q, as_dict=True)