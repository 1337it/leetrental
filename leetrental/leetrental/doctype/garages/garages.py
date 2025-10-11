# Copyright (c) 2024, Your Company and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document


class Garages(Document):
    def validate(self):
        self.validate_contact_details()
    
    def validate_contact_details(self):
        """Validate that at least one contact method is provided"""
        if not self.phone and not self.email:
            frappe.msgprint("Please provide at least Phone or Email contact information", 
                          indicator='orange', alert=True)