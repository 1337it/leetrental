# Copyright (c) 2024, Your Company and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe.utils import getdate


class CarService(Document):
    def validate(self):
        self.calculate_total_cost()
        self.validate_dates()
    
    def calculate_total_cost(self):
        """Calculate total cost from labor, parts, and other costs"""
        self.total_cost = (
            (self.labor_cost or 0) + 
            (self.parts_cost or 0) + 
            (self.other_costs or 0)
        )
    
    def validate_dates(self):
        """Validate that completion date is not before service date"""
        if self.completion_date and self.service_date:
            if self.completion_date < self.service_date:
                frappe.throw("Completion Date cannot be before Service Date")
    
    def on_submit(self):
        """Update vehicle's last service date and odometer reading"""
        if self.status == "Completed":
            try:
                vehicle = frappe.get_doc("Vehicles", self.vehicle)
                vehicle.db_set("last_odometer", self.odometer_reading)
                vehicle.add_comment("Comment", f"Service completed: {self.service_type}")
            except Exception as e:
                frappe.log_error(f"Error updating vehicle: {str(e)}")


@frappe.whitelist()
def get_vehicle_complete_info(vehicle):
    """
    Fetch complete vehicle information and last service details
    """
    if not vehicle:
        return {"vehicle_info": {}, "last_service": None}
    
    try:
        # Fetch vehicle information - only basic fields
        vehicle_info = frappe.db.sql("""
            SELECT 
                name,
                license_plate,
                make,
                model,
                year,
                chassis_no,
                fuel_type,
                transmission_type,
                color,
                last_odometer
            FROM 
                `tabVehicles`
            WHERE 
                name = %(vehicle)s
        """, {"vehicle": vehicle}, as_dict=True)
        
        if not vehicle_info:
            return {"vehicle_info": {"name": vehicle}, "last_service": None}
        
        # Get last service record
        last_service = frappe.db.sql("""
            SELECT 
                name, 
                service_date, 
                service_type, 
                odometer_reading
            FROM 
                `tabCar Service`
            WHERE 
                vehicle = %(vehicle)s
                AND status = 'Completed'
                AND docstatus != 2
            ORDER BY 
                service_date DESC
            LIMIT 1
        """, {"vehicle": vehicle}, as_dict=True)
        
        result = {
            "vehicle_info": vehicle_info[0] if vehicle_info else {"name": vehicle},
            "last_service": last_service[0] if last_service else None
        }
        
        return result
    
    except Exception as e:
        frappe.log_error(f"Error fetching vehicle info: {str(e)}", "Car Service Vehicle Info")
        return {
            "vehicle_info": {"name": vehicle},
            "last_service": None,
            "error": str(e)
        }


@frappe.whitelist()
def get_vehicle_info(vehicle):
    """
    Legacy method - kept for backward compatibility
    """
    return get_vehicle_complete_info(vehicle)