# Copyright (c) 2024, Your Company and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import now_datetime, get_datetime


class Workshop(Document):
    def validate(self):
        self.update_current_stage()
        self.calculate_totals()
        self.validate_completion()
        self.populate_vehicle_info()
    
    def populate_vehicle_info(self):
        """Populate vehicle information fields"""
        if self.vehicle and not self.license_plate:
            try:
                vehicle = frappe.db.get_value(
                    "Vehicles",
                    self.vehicle,
                    ["license_plate", "make", "model", "year", "chassis_no", "fuel_type", "color"],
                    as_dict=True
                )
                
                if vehicle:
                    self.license_plate = vehicle.get("license_plate")
                    self.make = vehicle.get("make")
                    self.model = vehicle.get("model")
                    self.year = vehicle.get("year")
                    self.vin = vehicle.get("chassis_no")
                    self.fuel_type = vehicle.get("fuel_type")
                    self.color = vehicle.get("color")
            except Exception as e:
                frappe.log_error(f"Error populating vehicle info: {str(e)}")
    
    def update_current_stage(self):
        """Update current stage based on sub jobs"""
        if not self.sub_jobs:
            self.current_stage = "No sub jobs defined"
            return
        
        # Get status counts
        status_counts = {}
        for job in self.sub_jobs:
            status_counts[job.status] = status_counts.get(job.status, 0) + 1
        
        total_jobs = len(self.sub_jobs)
        
        # Determine current stage
        if status_counts.get("Completed", 0) == total_jobs:
            self.current_stage = f"All jobs completed ({total_jobs}/{total_jobs})"
        elif status_counts.get("Test Run Failed", 0) > 0:
            self.current_stage = f"Test run failed - {status_counts.get('Test Run Failed', 0)} job(s)"
        elif status_counts.get("Approval Pending", 0) > 0:
            self.current_stage = f"Awaiting approval - {status_counts.get('Approval Pending', 0)} job(s)"
        elif status_counts.get("Vehicle Work in Progress", 0) > 0:
            completed = status_counts.get("Completed", 0)
            self.current_stage = f"In progress - {completed}/{total_jobs} jobs completed"
        else:
            self.current_stage = f"Started - {total_jobs} job(s) defined"
    
    def calculate_totals(self):
        """Calculate total costs from sub jobs"""
        total_labor_hours = 0
        total_labor_cost = 0
        total_parts_cost = 0
        
        for job in self.sub_jobs:
            # Calculate labor cost for each job
            if job.actual_hours and job.labor_rate:
                job.labor_cost = job.actual_hours * job.labor_rate
            elif job.estimated_hours and job.labor_rate:
                job.labor_cost = job.estimated_hours * job.labor_rate
            
            # Calculate parts cost for each job
            job_parts_cost = 0
            if job.parts_used:
                for part in job.parts_used:
                    part.amount = (part.quantity or 0) * (part.unit_price or 0)
                    job_parts_cost += part.amount
            job.parts_cost = job_parts_cost
            
            # Calculate total cost for job
            job.total_cost = (job.labor_cost or 0) + (job.parts_cost or 0)
            
            # Add to workshop totals
            total_labor_hours += job.actual_hours or job.estimated_hours or 0
            total_labor_cost += job.labor_cost or 0
            total_parts_cost += job_parts_cost
        
        self.total_labor_hours = total_labor_hours
        self.total_labor_cost = total_labor_cost
        self.total_parts_cost = total_parts_cost
        self.total_workshop_cost = total_labor_cost + total_parts_cost
    
    def validate_completion(self):
        """Validate completion status"""
        if self.status == "Completed":
            if not self.actual_completion:
                self.actual_completion = now_datetime()
            
            # Check if all sub jobs are completed
            incomplete_jobs = [job.job_title for job in self.sub_jobs if job.status != "Completed"]
            if incomplete_jobs:
                frappe.msgprint(
                    f"Warning: The following sub jobs are not completed: {', '.join(incomplete_jobs)}",
                    indicator='orange',
                    alert=True
                )
    
    def on_update(self):
        """Update vehicle status when workshop status changes"""
        if self.has_value_changed("status"):
            self.add_comment("Comment", f"Status changed to: {self.status}")
    
    def before_submit(self):
        """Validate before submission"""
        if self.status not in ["Completed", "Cancelled"]:
            frappe.throw("Workshop can only be submitted when status is Completed or Cancelled")
        
        if self.status == "Completed":
            # Update vehicle odometer
            try:
                vehicle = frappe.get_doc("Vehicles", self.vehicle)
                vehicle.db_set("last_odometer", self.entry_odometer)
                vehicle.add_comment("Comment", f"Workshop completed: {self.name}")
            except Exception as e:
                frappe.log_error(f"Error updating vehicle: {str(e)}")


@frappe.whitelist()
def get_vehicle_workshop_history(vehicle):
    """Get workshop history for a vehicle"""
    history = frappe.get_all(
        "Workshop",
        filters={"vehicle": vehicle, "docstatus": ["!=", 2]},
        fields=["name", "entry_datetime", "status", "issue_description", "total_workshop_cost"],
        order_by="entry_datetime desc",
        limit=10
    )
    return history


@frappe.whitelist()
def update_sub_job_status(workshop, sub_job_idx, new_status):
    """Update status of a specific sub job"""
    doc = frappe.get_doc("Workshop", workshop)
    
    if int(sub_job_idx) < len(doc.sub_jobs):
        doc.sub_jobs[int(sub_job_idx)].status = new_status
        doc.save()
        frappe.msgprint(f"Sub job status updated to: {new_status}")
        return True
    
    return False


@frappe.whitelist()
def approve_workshop(workshop_name, approved_by, approval_notes=None):
    """Approve workshop"""
    workshop = frappe.get_doc("Workshop", workshop_name)
    
    if workshop.status != "Approval Pending":
        frappe.throw("Workshop must be in Approval Pending status")
    
    workshop.status = "Approved"
    workshop.approval_status = "Approved"
    workshop.approved_by = approved_by
    workshop.approval_date = now_datetime()
    if approval_notes:
        workshop.approval_notes = approval_notes
    
    workshop.save()
    
    frappe.msgprint("Workshop approved successfully", alert=True, indicator="green")
    return workshop


@frappe.whitelist()
def get_workshop_summary(workshop_name):
    """Get workshop summary with all details"""
    workshop = frappe.get_doc("Workshop", workshop_name)
    
    summary = {
        "vehicle": workshop.vehicle,
        "license_plate": workshop.license_plate,
        "status": workshop.status,
        "current_stage": workshop.current_stage,
        "entry_datetime": workshop.entry_datetime,
        "expected_completion": workshop.expected_completion,
        "total_cost": workshop.total_workshop_cost,
        "sub_jobs_count": len(workshop.sub_jobs),
        "completed_jobs": len([j for j in workshop.sub_jobs if j.status == "Completed"]),
        "pending_jobs": len([j for j in workshop.sub_jobs if j.status != "Completed"])
    }
    
    return summary