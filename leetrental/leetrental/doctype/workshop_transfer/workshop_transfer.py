# Copyright (c) 2024, Your Company and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime, time_diff_in_seconds


class WorkshopTransfer(Document):
    def validate(self):
        self.validate_workshops()
        self.calculate_duration()
        self.load_pending_jobs()
    
    def validate_workshops(self):
        """Validate that from and to workshops are different"""
        if self.from_workshop == self.to_workshop:
            frappe.throw("Source and destination workshops cannot be the same")
    
    def calculate_duration(self):
        """Calculate transfer duration"""
        if self.handover_datetime and self.received_datetime:
            duration = time_diff_in_seconds(self.received_datetime, self.handover_datetime)
            self.transfer_duration = duration
    
    def load_pending_jobs(self):
        """Load pending jobs from workshop if not already loaded"""
        if not self.pending_jobs and self.workshop:
            workshop_doc = frappe.get_doc("Workshop", self.workshop)
            
            for job in workshop_doc.sub_jobs:
                if job.status != "Completed":
                    self.append("pending_jobs", {
                        "job_title": job.job_title,
                        "job_type": job.job_type,
                        "status": job.status,
                        "priority": job.priority,
                        "completion_percentage": job.completion_percentage,
                        "description": job.job_description,
                        "work_done": job.findings,
                        "remaining_work": job.notes
                    })
    
    def on_submit(self):
        """Update workshop and create new workshop entry at destination"""
        if self.status != "Completed":
            frappe.throw("Transfer can only be submitted when status is Completed")
        
        # Update source workshop
        self.update_source_workshop()
        
        # Create new workshop at destination
        self.create_destination_workshop()
        
        # Update vehicle location
        self.update_vehicle_location()
    
    def update_source_workshop(self):
        """Update source workshop status"""
        workshop = frappe.get_doc("Workshop", self.workshop)
        workshop.add_comment("Comment", f"Vehicle transferred to {self.to_workshop} via {self.name}")
        workshop.db_set("status", "Completed")
    
    def create_destination_workshop(self):
        """Create a new workshop entry at destination"""
        source_workshop = frappe.get_doc("Workshop", self.workshop)
        
        new_workshop = frappe.new_doc("Workshop")
        new_workshop.vehicle = self.vehicle
        new_workshop.entry_datetime = self.received_datetime or now_datetime()
        new_workshop.entry_odometer = self.odometer_reading
        new_workshop.priority = self.priority
        new_workshop.status = "Vehicle Entry"
        new_workshop.garage = self.to_workshop
        new_workshop.bay_number = self.to_bay_number
        new_workshop.issue_description = f"<b>Transferred from {self.from_workshop}</b><br><br>{source_workshop.issue_description}"
        new_workshop.initial_diagnosis = source_workshop.initial_diagnosis
        new_workshop.customer_complaint = source_workshop.customer_complaint
        
        # Add transfer reference
        new_workshop.internal_notes = f"Transferred via: {self.name}<br>Transfer Reason: {self.transfer_reason}"
        
        # Copy pending jobs
        for job in self.pending_jobs:
            new_workshop.append("sub_jobs", {
                "job_title": job.job_title,
                "job_type": job.job_type,
                "status": job.status,
                "priority": job.priority,
                "completion_percentage": job.completion_percentage,
                "job_description": f"{job.description}<br><br><b>Work Done:</b><br>{job.work_done or 'None'}<br><br><b>Remaining Work:</b><br>{job.remaining_work or 'Not specified'}"
            })
        
        new_workshop.insert()
        
        # Link the new workshop
        self.db_set("new_workshop", new_workshop.name)
        
        frappe.msgprint(f"New workshop entry created: {new_workshop.name}", alert=True, indicator="green")
    
    def update_vehicle_location(self):
        """Update vehicle location tracking"""
        vehicle = frappe.get_doc("Vehicles", self.vehicle)
        vehicle.add_comment("Comment", f"Transferred from {self.from_workshop} to {self.to_workshop}")


@frappe.whitelist()
def mark_as_received(transfer_name, received_by):
    """Mark transfer as received"""
    transfer = frappe.get_doc("Workshop Transfer", transfer_name)
    
    if transfer.status == "Received":
        frappe.throw("Transfer already marked as received")
    
    transfer.status = "Received"
    transfer.received_by = received_by
    transfer.received_datetime = now_datetime()
    transfer.save()
    
    frappe.msgprint("Transfer marked as received", alert=True, indicator="green")
    return transfer


@frappe.whitelist()
def mark_as_in_transit(transfer_name, handed_over_by):
    """Mark transfer as in transit"""
    transfer = frappe.get_doc("Workshop Transfer", transfer_name)
    
    if transfer.status != "Pending":
        frappe.throw("Transfer can only be marked in transit from Pending status")
    
    transfer.status = "In Transit"
    transfer.handed_over_by = handed_over_by
    transfer.handover_datetime = now_datetime()
    transfer.save()
    
    frappe.msgprint("Transfer marked as in transit", alert=True, indicator="blue")
    return transfer


@frappe.whitelist()
def get_workshop_transfers(vehicle=None, workshop=None):
    """Get workshop transfers for a vehicle or workshop"""
    filters = {"docstatus": ["!=", 2]}
    
    if vehicle:
        filters["vehicle"] = vehicle
    
    if workshop:
        filters["$or"] = [
            {"from_workshop": workshop},
            {"to_workshop": workshop}
        ]
    
    transfers = frappe.get_all(
        "Workshop Transfer",
        filters=filters,
        fields=["name", "transfer_date", "from_workshop", "to_workshop", "status", "vehicle", "license_plate"],
        order_by="transfer_date desc"
    )
    
    return transfers


@frappe.whitelist()
def approve_transfer(transfer_name, approved_by, approval_notes=None):
    """Approve workshop transfer"""
    transfer = frappe.get_doc("Workshop Transfer", transfer_name)
    
    if not transfer.requires_approval:
        frappe.throw("This transfer does not require approval")
    
    if transfer.approval_status == "Approved":
        frappe.throw("Transfer already approved")
    
    transfer.approval_status = "Approved"
    transfer.approved_by = approved_by
    transfer.approval_date = now_datetime()
    if approval_notes:
        transfer.approval_notes = approval_notes
    
    transfer.save()
    
    frappe.msgprint("Transfer approved successfully", alert=True, indicator="green")
    return transfer