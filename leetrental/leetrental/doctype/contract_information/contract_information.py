# Copyright (c) 2022, Solufy and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import utils

class ContractInformation(Document):
	pass

def asd():
	lead_sql = frappe.db.get_list('Contract Information',filters={'contract_expiration_date': utils.today()},fields=['name'],as_list=True)
	for d in lead_sql:
		upd_lead = frappe.db.get_value("Contract Information",{'contract_expiration_date':utils.today(),'name':d[0]},'name')
		if upd_lead:
			frappe.db.set_value("Contract Information", upd_lead, "workflow_state", "Expired")
			
	
