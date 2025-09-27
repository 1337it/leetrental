# leetrental/leetrental/page/vehicle_kanban/vehicle_kanban.py
import frappe
from frappe import _
from frappe.utils import now_datetime, now

VEHICLE_MOVEMENTS_DT = "vehicle_movements"   # your Movement doctype name
AGREEMENT_DT = "agreements"                  # change if your doctype name differs

@frappe.whitelist()
def fetch_vehicles():
    fields = [
        "name", "license_plate", "model", "year",
        "vehicle_status", "last_odometer_value", "current_agreement"
    ]
    # add your own filters here if needed
    return {"vehicles": frappe.get_all("Vehicles", fields=fields, order_by="license_plate asc")}

@frappe.whitelist()
def transition_vehicle_status(vehicle: str, from_status: str, to_status: str, payload: dict | None = None):
    payload = payload or {}
    v = frappe.get_doc("Vehicles", vehicle)

    if from_status == to_status:
        return {"ok": True, "message": _("No status change.")}

    allowed = _allowed_transitions()
    if to_status not in allowed.get(from_status, []):
        frappe.throw(_("Transition from {0} to {1} is not allowed.").format(from_status, to_status))

    # --- Create Movement row (single doc per transition) ---
    mv = _make_movement_doc(v, from_status, to_status, payload)

    # --- Agreements side-effects (optional, only if data provided) ---
    if (from_status in ("Available", "Reserved", "Out for Delivery") and to_status == "Rented Out"):
        _maybe_create_or_update_agreement(v, payload)

    # --- Update Vehicle status / convenience data ---
    v.db_set("status", to_status)
    if payload.get("odometer_value"):
        v.db_set("odometer", payload.get("odometer_value"))

    if payload.get("agreement_no"):
        # if vehicle has a convenience link, update it
        if "current_agreement" in v.meta.get_fieldnames():
            v.db_set("current_agreement", payload["agreement_no"])

    frappe.db.commit()
    return {"ok": True, "movement": mv.name}

# ---------- Helpers ----------

def _allowed_transitions():
    return {
        "Available": ["Reserved", "Out for Delivery", "Rented Out", "At Garage", "Under Maintenance", "Accident/Repair", "Deactivated"],
        "Reserved": ["Available", "Out for Delivery", "Rented Out", "Deactivated"],
        "Out for Delivery": ["Rented Out", "Available", "Reserved"],
        "Rented Out": ["Due for Return", "At Garage", "Accident/Repair"],
        "Due for Return": ["Returned (Inspection)"],
        "Returned (Inspection)": ["Available", "At Garage", "Under Maintenance"],
        "At Garage": ["Available", "Under Maintenance", "Accident/Repair"],
        "Under Maintenance": ["Available", "At Garage"],
        "Accident/Repair": ["At Garage", "Under Maintenance", "Available"],
        "Deactivated": ["Available"],
    }

def _infer_movement_type(from_status, to_status):
    m = {
        ("Available", "Reserved"): "Reservation",
        ("Reserved", "Out for Delivery"): "Dispatch",
        ("Available", "Out for Delivery"): "Dispatch",
        ("Out for Delivery", "Rented Out"): "Handover",
        ("Available", "Rented Out"): "Walk-in Handover",
        ("Rented Out", "Due for Return"): "Recall",
        ("Due for Return", "Returned (Inspection)"): "Check-in",
        ("Returned (Inspection)", "Available"): "Ready",
        ("Returned (Inspection)", "At Garage"): "Send to Workshop",
        ("Available", "At Garage"): "Send to Workshop",
        ("At Garage", "Available"): "Return from Workshop",
        ("Available", "Under Maintenance"): "Send to Workshop",
        ("Under Maintenance", "Available"): "Return from Workshop",
        ("Rented Out", "Accident/Repair"): "Incident",
        ("Accident/Repair", "At Garage"): "Tow to Workshop",
        ("Deactivated", "Available"): "Reactivate",
    }
    return m.get((from_status, to_status), "Status Change")

def _make_movement_doc(vehicle_doc, from_status, to_status, p):
    """
    Build a vehicle_movements doc using your exact fieldnames.
    We fill OUT* fields for 'leaving' transitions and IN* fields for 'return' transitions.
    """
    movement_type = _infer_movement_type(from_status, to_status)
    is_out = to_status in ("Reserved", "Out for Delivery", "Rented Out", "At Garage", "Under Maintenance", "Accident/Repair")
    is_in  = to_status in ("Returned (Inspection)", "Available") and from_status in ("Rented Out", "Due for Return", "Returned (Inspection)", "At Garage", "Under Maintenance", "Accident/Repair")

    doc = frappe.new_doc(VEHICLE_MOVEMENTS_DT)
    # Header
    doc.update({
        "movement_id": p.get("movement_id"),
        "movement_type": movement_type,
        "movement_subtype": p.get("movement_subtype"),
        "vehicle": vehicle_doc.name,
        "date": p.get("date") or now(),              # can be Date; server will coerce if fieldtype is Date
        "agreement_no": p.get("agreement_no"),
        "manual_agreement_no": p.get("manual_agreement_no"),
        "unit": p.get("unit"),
        "purchase_order_no": p.get("purchase_order_no"),
        "workshop": p.get("workshop"),
        "odometer_value": p.get("odometer_value") or vehicle_doc.get("odometer"),
        # travel locations
        "out_from": p.get("out_from"),
        "in_to": p.get("in_to"),
        "pickup_location": p.get("pickup_location"),
        "drop_location": p.get("drop_location"),
        "service_done": p.get("service_done"),
    })

    # OUT side (leaving/dispatch/handover/workshop send)
    if is_out or (from_status in ("Available", "Reserved", "Out for Delivery") and to_status in ("Rented Out", "At Garage", "Under Maintenance", "Accident/Repair")):
        doc.update({
            "out_date_time": p.get("out_date_time") or now_datetime(),
            "out_notes": p.get("out_notes"),
            "out_fuel_level": p.get("out_fuel_level"),
            "out_branch": p.get("out_branch"),
            "out_customer": p.get("out_customer"),
            "out_mileage": p.get("out_mileage"),
            "out_driver": p.get("out_driver"),
            "out_staff": p.get("out_staff"),
        })

    # IN side (check-in/return/workshop back)
    if is_in or (from_status in ("Rented Out", "Due for Return", "Returned (Inspection)", "At Garage", "Under Maintenance", "Accident/Repair") and to_status in ("Returned (Inspection)", "Available")):
        doc.update({
            "in_date_time": p.get("in_date_time") or now_datetime(),
            "in_notes": p.get("in_notes"),
            "in_fuel_level": p.get("in_fuel_level"),
            "in_branch": p.get("in_branch"),
            "in_customer": p.get("in_customer"),
            "in_mileage": p.get("in_mileage"),
            "in_driver": p.get("in_driver"),
            "in_staff": p.get("in_staff"),
        })

    doc.insert(ignore_permissions=True)
    return doc

def _maybe_create_or_update_agreement(vehicle_doc, p):
    """
    Creates a minimal Agreements doc using your fieldnames if start/end are provided.
    If p.agreement_no exists, we skip creation (assume user brought their own number).
    """
    if p.get("agreement_no"):
        return

    # Only create if we have basic timing/rate inputs
    if not (p.get("start_time") or p.get("rent_from")):
        return
    start_time = p.get("start_time") or p.get("rent_from")
    end_time   = p.get("end_time") or p.get("rent_to")

    ag = frappe.new_doc(AGREEMENT_DT)
    ag.update({
        "vehicle": vehicle_doc.name,
        "driver": p.get("out_driver") or p.get("driver"),
        "start_time": start_time,
        "end_time": end_time,
        "pickup_location": p.get("pickup_location"),
        "drop_location": p.get("drop_location"),
        "fuel_level_out": p.get("out_fuel_level"),
        "mileage_out": p.get("out_mileage") or p.get("odometer_value"),
        "notes": p.get("out_notes"),
        "agreement_type": p.get("agreement_type") or "Rental",
        "rent_rate": p.get("rent_rate"),
        "agreed_rent": p.get("agreed_rent"),
        "sales_person": p.get("sales_person"),
    })
    ag.insert(ignore_permissions=True)

    # hand back the agreement number to the UI via payload echo
    frappe.db.set_value("Vehicles", vehicle_doc.name, "current_agreement", ag.name)
