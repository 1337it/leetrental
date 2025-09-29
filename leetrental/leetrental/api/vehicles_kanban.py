# leetrental/leetrental/api/vehicles_kanban.py
import frappe
from frappe import _
import json

@frappe.whitelist()
def get_kanban_data(filters=None):
    """
    Fetch vehicles grouped by workflow state for Kanban view
    """
    if filters and isinstance(filters, str):
        filters = json.loads(filters)
    
    # Get all workflow states for Vehicles
    workflow_states = frappe.get_all(
        "Workflow State",
        fields=["name", "style"],
        order_by="idx"
    )
    
    # Build base query filters
    base_filters = {"doctype": "Vehicles"}
    if filters:
        base_filters.update(filters)
    
    # Get vehicles with relevant fields
    vehicles = frappe.get_all(
        "Vehicles",
        fields=[
            "name", "license_plate", "model", "chassis_number",
            "workflow_state", "driver", "location", "last_odometer_value",
            "color", "model_year", "fuel_type", "tags", "image"
        ],
        order_by="modified desc"
    )
    
    # Group vehicles by workflow state
    kanban_data = {}
    for state in workflow_states:
        kanban_data[state.name] = {
            "label": state.name,
            "style": state.style or "default",
            "vehicles": []
        }
    
    # Add vehicles to their respective columns
    for vehicle in vehicles:
        state = vehicle.workflow_state or "Draft"
        if state in kanban_data:
            kanban_data[state]["vehicles"].append(vehicle)
        else:
            # Handle vehicles with states not in workflow
            if "Other" not in kanban_data:
                kanban_data["Other"] = {
                    "label": "Other",
                    "style": "default",
                    "vehicles": []
                }
            kanban_data["Other"]["vehicles"].append(vehicle)
    
    return kanban_data


@frappe.whitelist()
def move_vehicle(vehicle_name, from_state, to_state):
    """
    Handle vehicle state transition with validation
    Returns required fields for the transition
    """
    try:
        # Get the vehicle document
        vehicle = frappe.get_doc("Vehicles", vehicle_name)
        
        # Validate transition is allowed
        allowed = validate_transition(vehicle, from_state, to_state)
        if not allowed["valid"]:
            return {
                "success": False,
                "message": allowed["message"]
            }
        
        # Get required fields for this transition
        required_fields = get_required_fields_for_transition(from_state, to_state)
        
        return {
            "success": True,
            "vehicle": vehicle_name,
            "from_state": from_state,
            "to_state": to_state,
            "required_fields": required_fields,
            "requires_input": len(required_fields) > 0
        }
        
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Kanban Move Error")
        return {
            "success": False,
            "message": str(e)
        }


@frappe.whitelist()
def complete_vehicle_move(vehicle_name, from_state, to_state, form_data=None):
    """
    Complete the vehicle move and create necessary documents
    """
    if form_data and isinstance(form_data, str):
        form_data = json.loads(form_data)
    
    try:
        vehicle = frappe.get_doc("Vehicles", vehicle_name)
        
        # Create documents based on transition
        created_docs = []
        
        # Draft -> Registered: Just update workflow state
        if from_state == "Draft" and to_state == "Registered":
            vehicle.workflow_state = to_state
            vehicle.save(ignore_permissions=True)
            created_docs.append({"doctype": "Vehicles", "name": vehicle.name})
        
        # Registered -> Reserve: Create Car Reservation
        elif from_state == "Registered" and to_state == "Reserve":
            if form_data:
                reservation = create_car_reservation(vehicle, form_data)
                created_docs.append({"doctype": "Car Reservations", "name": reservation.name})
            vehicle.workflow_state = to_state
            vehicle.save(ignore_permissions=True)
        
        # Reserve -> Waiting List: Create movement record
        elif to_state == "Waiting List":
            if form_data:
                movement = create_vehicle_movement(vehicle, form_data, "NRM - Customer")
                created_docs.append({"doctype": "Vehicle Movements", "name": movement.name})
            vehicle.workflow_state = to_state
            vehicle.save(ignore_permissions=True)
        
        # Any -> Workshop (Downgraded): Create Service record
        elif to_state == "Downgraded":
            if form_data:
                service = create_service_record(vehicle, form_data)
                created_docs.append({"doctype": "Services", "name": service.name})
            vehicle.workflow_state = to_state
            vehicle.save(ignore_permissions=True)
        
        else:
            # Default: just update state
            vehicle.workflow_state = to_state
            vehicle.save(ignore_permissions=True)
            created_docs.append({"doctype": "Vehicles", "name": vehicle.name})
        
        frappe.db.commit()
        
        return {
            "success": True,
            "message": f"Vehicle {vehicle.license_plate} moved to {to_state}",
            "created_docs": created_docs
        }
        
    except Exception as e:
        frappe.db.rollback()
        frappe.log_error(frappe.get_traceback(), "Complete Vehicle Move Error")
        return {
            "success": False,
            "message": str(e)
        }


def validate_transition(vehicle, from_state, to_state):
    """
    Validate if the transition is allowed based on workflow
    """
    # Get workflow for Vehicles
    workflow = frappe.get_all(
        "Workflow",
        filters={"document_type": "Vehicles", "is_active": 1},
        fields=["name"],
        limit=1
    )
    
    if not workflow:
        return {"valid": True, "message": "No workflow defined"}
    
    # Get allowed transitions
    transitions = frappe.get_all(
        "Workflow Transition",
        filters={
            "parent": workflow[0].name,
            "state": from_state
        },
        fields=["next_state", "action"]
    )
    
    allowed_states = [t.next_state for t in transitions]
    
    if to_state not in allowed_states:
        return {
            "valid": False,
            "message": f"Transition from {from_state} to {to_state} is not allowed"
        }
    
    return {"valid": True, "message": "Transition allowed"}


def get_required_fields_for_transition(from_state, to_state):
    """
    Return required fields based on the transition
    """
    fields_map = {
        ("Registered", "Reserve"): [
            {"fieldname": "driver", "fieldtype": "Link", "options": "Customer", "label": "Customer", "reqd": 1},
            {"fieldname": "start_time", "fieldtype": "Datetime", "label": "Start Time", "reqd": 1},
            {"fieldname": "end_time", "fieldtype": "Datetime", "label": "End Time", "reqd": 1},
            {"fieldname": "pickup_location", "fieldtype": "Link", "options": "Reservation Locations", "label": "Pickup Location"},
            {"fieldname": "drop_location", "fieldtype": "Link", "options": "Reservation Locations", "label": "Drop Location"},
        ],
        ("Reserve", "Waiting List"): [
            {"fieldname": "agreement_no", "fieldtype": "Data", "label": "Agreement No", "reqd": 1},
            {"fieldname": "out_customer", "fieldtype": "Link", "options": "Customer", "label": "Customer", "reqd": 1},
            {"fieldname": "out_date_time", "fieldtype": "Datetime", "label": "Out Date & Time", "reqd": 1},
            {"fieldname": "out_mileage", "fieldtype": "Int", "label": "Out Mileage (KM)", "reqd": 1},
            {"fieldname": "out_fuel_level", "fieldtype": "Data", "label": "Out Fuel Level"},
            {"fieldname": "out_from", "fieldtype": "Data", "label": "From Location"},
        ],
        ("Registered", "Downgraded"): [
            {"fieldname": "service_type", "fieldtype": "Link", "options": "Service Types", "label": "Service Type", "reqd": 1},
            {"fieldname": "description", "fieldtype": "Data", "label": "Description", "reqd": 1},
            {"fieldname": "date", "fieldtype": "Date", "label": "Service Date", "reqd": 1},
            {"fieldname": "cost", "fieldtype": "Currency", "label": "Estimated Cost"},
            {"fieldname": "vendor", "fieldtype": "Link", "options": "Supplier", "label": "Vendor"},
            {"fieldname": "note", "fieldtype": "Small Text", "label": "Notes"},
        ],
    }
    
    return fields_map.get((from_state, to_state), [])


def create_car_reservation(vehicle, data):
    """
    Create a Car Reservation document
    """
    reservation = frappe.get_doc({
        "doctype": "Car Reservations",
        "vehicle": vehicle.name,
        "driver": data.get("driver"),
        "start_time": data.get("start_time"),
        "end_time": data.get("end_time"),
        "pickup_location": data.get("pickup_location"),
        "drop_location": data.get("drop_location"),
        "workflow_state": "New"
    })
    reservation.insert(ignore_permissions=True)
    return reservation


def create_vehicle_movement(vehicle, data, movement_type):
    """
    Create a Vehicle Movement document
    """
    movement = frappe.get_doc({
        "doctype": "Vehicle Movements",
        "vehicle": vehicle.name,
        "movement_type": movement_type,
        "agreement_no": data.get("agreement_no"),
        "out_customer": data.get("out_customer"),
        "out_date_time": data.get("out_date_time"),
        "out_mileage": data.get("out_mileage"),
        "out_fuel_level": data.get("out_fuel_level"),
        "out_from": data.get("out_from"),
        "date": frappe.utils.today()
    })
    movement.insert(ignore_permissions=True)
    return movement


def create_service_record(vehicle, data):
    """
    Create a Service document
    """
    service = frappe.get_doc({
        "doctype": "Services",
        "vehicle": vehicle.name,
        "service_type": data.get("service_type"),
        "description": data.get("description"),
        "date": data.get("date"),
        "cost": data.get("cost"),
        "vendor": data.get("vendor"),
        "note": data.get("note"),
        "workflow_state": "To Do"
    })
    service.insert(ignore_permissions=True)
    return service


@frappe.whitelist()
def search_vehicles(query, filters=None):
    """
    Search vehicles for quick filtering in Kanban
    """
    if filters and isinstance(filters, str):
        filters = json.loads(filters)
    
    conditions = ["1=1"]
    values = {}
    
    if query:
        conditions.append("(license_plate LIKE %(query)s OR model LIKE %(query)s OR chassis_number LIKE %(query)s)")
        values["query"] = f"%{query}%"
    
    if filters:
        for key, value in filters.items():
            conditions.append(f"`{key}` = %({key})s")
            values[key] = value
    
    where_clause = " AND ".join(conditions)
    
    vehicles = frappe.db.sql(f"""
        SELECT 
            name, license_plate, model, chassis_number,
            workflow_state, driver, location
        FROM `tabVehicles`
        WHERE {where_clause}
        ORDER BY modified DESC
        LIMIT 20
    """, values, as_dict=True)
    
    return vehicles
