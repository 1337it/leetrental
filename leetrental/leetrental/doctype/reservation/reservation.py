# Copyright (c) 2024, LeetRental and contributors
# For license information, please see license.txt

import frappe
from frappe import _
from frappe.model.document import Document
from frappe.utils import get_datetime, now_datetime


class Reservation(Document):
    def __init__(self, *args, **kwargs):
        super(Reservation, self).__init__(*args, **kwargs)
        self.previous_vehicle_status = None

    def before_save(self):
        """Store the vehicle's previous status before any changes"""
        if self.vehicle and not self.is_new():
            vehicle = frappe.get_doc("Vehicles", self.vehicle)
            self.previous_vehicle_status = vehicle.status

    def validate(self):
        """Validate reservation before save"""
        self.validate_dates()
        self.validate_vehicle_availability()
        
        # Set status to Confirmed on submit if still Draft
        if self.docstatus == 0 and self.reservation_status == "Draft":
            self.reservation_status = "Confirmed"

    def validate_dates(self):
        """Validate pick up and return datetimes"""
        if not self.pick_up_datetime or not self.return_datetime:
            return
            
        pick_up = get_datetime(self.pick_up_datetime)
        return_dt = get_datetime(self.return_datetime)
        
        if return_dt <= pick_up:
            frappe.throw(_("Return Datetime must be after Pick Up Datetime"))
        
        # Optional: Validate that pick up is not in the past
        if pick_up < now_datetime() and self.is_new():
            frappe.throw(_("Pick Up Datetime cannot be in the past"))

    def validate_vehicle_availability(self):
        """Check for overlapping reservations or rental agreements for the same vehicle"""
        if not self.vehicle or not self.pick_up_datetime or not self.return_datetime:
            return
        
        pick_up = get_datetime(self.pick_up_datetime)
        return_dt = get_datetime(self.return_datetime)
        
        # Check for overlapping Reservations
        overlapping_reservations = frappe.db.sql("""
            SELECT name, pick_up_datetime, return_datetime
            FROM `tabReservation`
            WHERE vehicle = %(vehicle)s
                AND name != %(name)s
                AND docstatus = 1
                AND reservation_status NOT IN ('Cancelled', 'Expired')
                AND (
                    (pick_up_datetime <= %(return_datetime)s AND return_datetime >= %(pick_up_datetime)s)
                )
        """, {
            'vehicle': self.vehicle,
            'name': self.name or 'new',
            'pick_up_datetime': pick_up,
            'return_datetime': return_dt
        }, as_dict=True)
        
        if overlapping_reservations:
            reservation = overlapping_reservations[0]
            frappe.throw(_(
                "Vehicle {0} is already reserved from {1} to {2} (Reservation: {3})"
            ).format(
                self.vehicle,
                frappe.format(reservation.pick_up_datetime, {'fieldtype': 'Datetime'}),
                frappe.format(reservation.return_datetime, {'fieldtype': 'Datetime'}),
                reservation.name
            ))
        
        # Check for overlapping Rental Agreements (Car Reservations)
        if frappe.db.exists("DocType", "Car Reservations"):
            overlapping_rentals = frappe.db.sql("""
                SELECT name, start_date, end_date
                FROM `tabCar Reservations`
                WHERE vehicle = %(vehicle)s
                    AND docstatus = 1
                    AND reservation_status NOT IN ('Returned', 'Cancelled')
                    AND (
                        (start_date <= %(return_datetime)s AND end_date >= %(pick_up_datetime)s)
                    )
            """, {
                'vehicle': self.vehicle,
                'pick_up_datetime': pick_up,
                'return_datetime': return_dt
            }, as_dict=True)
            
            if overlapping_rentals:
                rental = overlapping_rentals[0]
                frappe.throw(_(
                    "Vehicle {0} is already rented from {1} to {2} (Car Reservation: {3})"
                ).format(
                    self.vehicle,
                    frappe.format(rental.start_date, {'fieldtype': 'Datetime'}),
                    frappe.format(rental.end_date, {'fieldtype': 'Datetime'}),
                    rental.name
                ))

    def before_submit(self):
        """Store vehicle status before submission"""
        if self.vehicle:
            vehicle = frappe.get_doc("Vehicles", self.vehicle)
            # Store the current status
            frappe.db.set_value("Vehicles", self.vehicle, "previous_status", vehicle.status, update_modified=False)
            self.previous_vehicle_status = vehicle.status

    def on_submit(self):
        """Update vehicle status to Reserved on submission"""
        if self.vehicle:
            vehicle = frappe.get_doc("Vehicles", self.vehicle)
            vehicle.status = "Reserved"
            vehicle.save(ignore_permissions=True)
            
            frappe.msgprint(
                _("Vehicle {0} status updated to Reserved").format(self.vehicle),
                alert=True
            )

    def on_cancel(self):
        """Revert vehicle status to previous status on cancellation"""
        if self.vehicle:
            # Get the previous status
            previous_status = frappe.db.get_value("Vehicles", self.vehicle, "previous_status")
            
            if previous_status:
                vehicle = frappe.get_doc("Vehicles", self.vehicle)
                vehicle.status = previous_status
                vehicle.save(ignore_permissions=True)
                
                frappe.msgprint(
                    _("Vehicle {0} status reverted to {1}").format(self.vehicle, previous_status),
                    alert=True
                )
            else:
                # Default to Available if no previous status found
                vehicle = frappe.get_doc("Vehicles", self.vehicle)
                vehicle.status = "Available"
                vehicle.save(ignore_permissions=True)
                
                frappe.msgprint(
                    _("Vehicle {0} status set to Available").format(self.vehicle),
                    alert=True
                )
        
        # Update reservation status
        self.db_set('reservation_status', 'Cancelled')

    def before_cancel(self):
        """Validate before cancellation"""
        # Check if there's an active rental agreement linked to this reservation
        if frappe.db.exists("DocType", "Car Reservations"):
            active_rental = frappe.db.exists("Car Reservations", {
                "reservation": self.name,
                "docstatus": 1,
                "reservation_status": ["not in", ["Returned", "Cancelled"]]
            })
            
            if active_rental:
                frappe.throw(_(
                    "Cannot cancel reservation. Active Car Reservation {0} exists for this reservation."
                ).format(active_rental))


def make_rental_agreement(source_name, target_doc=None):
    """Create Car Reservation from Reservation"""
    from frappe.model.mapper import get_mapped_doc
    
    def set_missing_values(source, target):
        target.reservation = source.name
        target.start_date = source.pick_up_datetime
        target.end_date = source.return_datetime
    
    doc = get_mapped_doc("Reservation", source_name, {
        "Reservation": {
            "doctype": "Car Reservations",
            "field_map": {
                "customer": "customer",
                "vehicle": "vehicle",
                "branch": "branch",
                "rate_plan": "rate_plan",
                "deposit_amount": "deposit_amount"
            }
        }
    }, target_doc, set_missing_values)
    
    return doc