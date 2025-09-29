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
    
    # Define the workflow states from vehicle_status field
    workflow_states = [
        {"name": "Available", "style": "Success", "idx": 0},
        {"name": "Reserved", "style": "Info", "idx": 1},
        {"name": "Out for Delivery", "style": "Warning", "idx": 2},
        {"name": "Rented Out", "style": "Primary", "idx": 3},
        {"name": "Due for Return", "style": "Warning", "idx": 4},
        {"name": "Returned (Inspection)", "style": "Info", "idx": 5},
        {"name": "At Garage", "style": "default", "idx": 6},
        {"name": "Under Maintenance", "style": "Warning", "idx": 7},
        {"name": "Accident/Repair", "style": "Danger", "idx": 8},
        {"name": "Deactivated", "style": "Danger", "idx": 9}
    ]
    
    # Get the status field name from Vehicles doctype
    vehicles_meta = frappe.get_meta("Vehicles")
    status_field_name = "workflow_state"  # default
    
    # Find the actual status field
    for field in vehicles_meta.fields:
        if field.fieldname in ["vehicle_status", "workflow_state", "status"]:
            status_field_name = field.fieldname
            break
    
    # Get meta to check available fields
    available_fields = {field.fieldname for field in vehicles_meta.fields}
    available_fields.add("name")  # Always available
    
    # Build field list dynamically
    base_fields = ["name", "license_plate", "chassis_number"]
    
    # Add the status field we found
    if status_field_name in available_fields:
        base_fields.append(status_field_name)
    optional_fields = {
        "model": "model",
        "driver": "driver", 
        "location": "location",
        "last_odometer_value": "last_odometer_value",
        "color": "color",
        "model_year": "model_year",
        "fuel_type": "fuel_type",
        "tags": "tags",
        "upload_photo": "image",  # Map upload_photo to image
        "image_5": "image"  # Alternative image field
    }
    
    fields_to_fetch = base_fields.copy()
    image_field = None
    
    for field, alias in optional_fields.items():
        if field in available_fields:
            if alias == "image" and not image_field:
                image_field = field
                fields_to_fetch.append(field)
            elif alias != "image":
                fields_to_fetch.append(field)
    
    # Build filters
    query_filters = {}
    if filters:
        for key, value in filters.items():
            if value and key in available_fields:
                query_filters[key] = value
    
    # Get vehicles
    try:
        vehicles = frappe.get_all(
            "Vehicles",
            fields=fields_to_fetch,
            filters=query_filters,
            order_by="modified desc"
        )
        
        # Normalize data
        for vehicle in vehicles:
            # Handle image field
            if image_field and image_field in vehicle:
                vehicle["image"] = vehicle.get(image_field)
                if image_field != "image":
                    del vehicle[image_field]
            else:
                vehicle["image"] = None
            
            # Normalize status field to workflow_state
            if status_field_name in vehicle and status_field_name != "workflow_state":
                vehicle["workflow_state"] = vehicle.get(status_field_name)
                if status_field_name != "workflow_state":
                    del vehicle[status_field_name]
            
            # Ensure all expected fields exist with defaults
            vehicle.setdefault("model", None)
            vehicle.setdefault("driver", None)
            vehicle.setdefault("location", None)
            vehicle.setdefault("last_odometer_value", 0)
            vehicle.setdefault("color", None)
            vehicle.setdefault("model_year", None)
            vehicle.setdefault("fuel_type", None)
            vehicle.setdefault("tags", None)
            vehicle.setdefault("workflow_state", workflow_states[0]["name"] if workflow_states else "Draft")
        
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Get Kanban Data Error")
        vehicles = []
    
    # Group vehicles by workflow state
    kanban_data = {}
    for state in workflow_states:
        kanban_data[state.name] = {
            "label": state.name,
            "style": state.style or "default",
            "vehicles": []
        }
    
    # Add vehicles to their respective columns
    default_state = workflow_states[0]["name"] if workflow_states else "Draft"
    for vehicle in vehicles:
        state = vehicle.get("workflow_state") or default_state
        if state in kanban_data:
            kanban_data[state]["vehicles"].append(vehicle)
        else:
            # Handle vehicles with states not in the options list
            if "Other" not in kanban_data:
                kanban_data["Other"] = {
                    "label": "Other",
                    "style": "default",
                    "vehicles": []
                }
            kanban_data["Other"]["vehicles"].append(vehicle)
    
    return kanban_data


def get_default_style_for_state(state):
    """
    Get default style based on state name
    """
    state_lower = state.lower()
    
    # Map common state names to styles
    style_mapping = {
        "draft": "Primary",
        "registered": "Success",
        "reserve": "Info",
        "reserved": "Info",
        "downgraded": "Danger",
        "waiting": "Warning",
        "waiting list": "Warning",
        "completed": "Success",
        "done": "Success",
        "cancelled": "Danger",
        "closed": "Danger",
        "in progress": "Info",
        "workshop": "Warning",
        "maintenance": "Warning",
        "available": "Success",
        "rented": "Info",
        "out of service": "Danger"
    }
    
    for key, style in style_mapping.items():
        if key in state_lower:
            return style
    
    return "default"


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
        
        # Find the status field name
        vehicles_meta = frappe.get_meta("Vehicles")
        status_field_name = "workflow_state"
        
        for field in vehicles_meta.fields:
            if field.fieldname in ["vehicle_status", "workflow_state", "status"]:
                status_field_name = field.fieldname
                break
        
        # Create documents based on transition
        created_docs = []
        
        # Available -> Reserved: Create Car Reservation
        if from_state == "Available" and to_state == "Reserved":
            if form_data:
                reservation = create_car_reservation(vehicle, form_data)
                created_docs.append({"doctype": "Car Reservations", "name": reservation.name})
            vehicle.set(status_field_name, to_state)
            vehicle.save(ignore_permissions=True)
        
        # Reserved -> Out for Delivery or Rented Out: Create Vehicle Movement
        elif from_state == "Reserved" and to_state in ["Out for Delivery", "Rented Out"]:
            if form_data:
                movement = create_vehicle_movement(vehicle, form_data, "NRM - Customer")
                created_docs.append({"doctype": "Vehicle Movements", "name": movement.name})
            vehicle.set(status_field_name, to_state)
            vehicle.save(ignore_permissions=True)
        
        # Out for Delivery -> Rented Out: Update movement or create agreement
        elif from_state == "Out for Delivery" and to_state == "Rented Out":
            if form_data and form_data.get("agreement_no"):
                # Update existing movement or create new
                movement = create_vehicle_movement(vehicle, form_data, "NRM - Customer")
                created_docs.append({"doctype": "Vehicle Movements", "name": movement.name})
            vehicle.set(status_field_name, to_state)
            vehicle.save(ignore_permissions=True)
        
        # Due for Return -> Returned (Inspection): Create return movement
        elif from_state == "Due for Return" and to_state == "Returned (Inspection)":
            if form_data:
                movement = create_vehicle_movement(vehicle, form_data, "NRM - Customer")
                created_docs.append({"doctype": "Vehicle Movements", "name": movement.name})
            vehicle.set(status_field_name, to_state)
            vehicle.save(ignore_permissions=True)
        
        # Any state -> Under Maintenance: Create Service record
        elif to_state == "Under Maintenance":
            if form_data:
                service = create_service_record(vehicle, form_data)
                created_docs.append({"doctype": "Services", "name": service.name})
            vehicle.set(status_field_name, to_state)
            vehicle.save(ignore_permissions=True)
        
        # Any state -> Accident/Repair: Create Service record with accident details
        elif to_state == "Accident/Repair":
            if form_data:
                service = create_accident_service_record(vehicle, form_data)
                created_docs.append({"doctype": "Services", "name": service.name})
            vehicle.set(status_field_name, to_state)
            vehicle.save(ignore_permissions=True)
        
        else:
            # Default: just update state
            vehicle.set(status_field_name, to_state)
            vehicle.save(ignore_permissions=True)
            created_docs.append({"doctype": "Vehicles", "name": vehicle.name})
        
        frappe.db.commit()
        
        return {
            "success": True,
            "message": _("Vehicle {0} moved to {1}").format(vehicle.license_plate or vehicle.name, to_state),
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
    Validate if the transition is allowed based on workflow or field options
    """
    # Get the Vehicles meta to check field options
    vehicles_meta = frappe.get_meta("Vehicles")
    status_field = None
    
    for field in vehicles_meta.fields:
        if field.fieldname in ["vehicle_status", "workflow_state", "status"]:
            status_field = field
            break
    
    # If using Select field with options, validate against options
    if status_field and status_field.fieldtype == "Select" and status_field.options:
        valid_states = [opt.strip() for opt in status_field.options.split("\n") if opt.strip()]
        if to_state not in valid_states:
            return {
                "valid": False,
                "message": _("{0} is not a valid state").format(to_state)
            }
        # For Select fields, any transition is allowed
        return {"valid": True, "message": "Transition allowed"}
    
    # Otherwise, check workflow
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
            "message": _("Transition from {0} to {1} is not allowed").format(from_state, to_state)
        }
    
    return {"valid": True, "message": "Transition allowed"}

def get_required_fields_for_transition(from_state, to_state):
    """
    Return required fields based on the transition
    """
    fields_map = {
        # Available -> Reserved
        ("Available", "Reserved"): [
            {"fieldname": "driver", "fieldtype": "Link", "options": "Customer", "label": _("Customer"), "reqd": 1},
            {"fieldname": "start_time", "fieldtype": "Datetime", "label": _("Start Time"), "reqd": 1},
            {"fieldname": "end_time", "fieldtype": "Datetime", "label": _("End Time"), "reqd": 1},
            {"fieldname": "pickup_location", "fieldtype": "Link", "options": "Reservation Locations", "label": _("Pickup Location")},
            {"fieldname": "drop_location", "fieldtype": "Link", "options": "Reservation Locations", "label": _("Drop Location")},
        ],
        
        # Reserved -> Out for Delivery
        ("Reserved", "Out for Delivery"): [
            {"fieldname": "out_driver", "fieldtype": "Link", "options": "Driver", "label": _("Driver")},
            {"fieldname": "out_date_time", "fieldtype": "Datetime", "label": _("Delivery Date & Time"), "reqd": 1},
            {"fieldname": "out_mileage", "fieldtype": "Int", "label": _("Out Mileage (KM)"), "reqd": 1},
            {"fieldname": "out_fuel_level", "fieldtype": "Data", "label": _("Out Fuel Level")},
        ],
        
        # Out for Delivery -> Rented Out
        ("Out for Delivery", "Rented Out"): [
            {"fieldname": "agreement_no", "fieldtype": "Data", "label": _("Agreement No"), "reqd": 1},
            {"fieldname": "out_customer", "fieldtype": "Link", "options": "Customer", "label": _("Customer"), "reqd": 1},
            {"fieldname": "out_from", "fieldtype": "Data", "label": _("Delivery Location")},
        ],
        
        # Rented Out -> Due for Return
        ("Rented Out", "Due for Return"): [
            {"fieldname": "expected_return_date", "fieldtype": "Datetime", "label": _("Expected Return Date"), "reqd": 1},
            {"fieldname": "return_location", "fieldtype": "Link", "options": "Reservation Locations", "label": _("Return Location")},
        ],
        
        # Due for Return -> Returned (Inspection)
        ("Due for Return", "Returned (Inspection)"): [
            {"fieldname": "in_date_time", "fieldtype": "Datetime", "label": _("Return Date & Time"), "reqd": 1},
            {"fieldname": "in_mileage", "fieldtype": "Int", "label": _("Return Mileage (KM)"), "reqd": 1},
            {"fieldname": "in_fuel_level", "fieldtype": "Data", "label": _("Return Fuel Level")},
            {"fieldname": "in_notes", "fieldtype": "Small Text", "label": _("Inspection Notes")},
        ],
        
        # Returned (Inspection) -> Available
        ("Returned (Inspection)", "Available"): [
            {"fieldname": "inspection_status", "fieldtype": "Select", "options": "Pass\nFail", "label": _("Inspection Status"), "reqd": 1},
            {"fieldname": "inspection_notes", "fieldtype": "Small Text", "label": _("Inspection Comments")},
        ],
        
        # Returned (Inspection) -> At Garage
        ("Returned (Inspection)", "At Garage"): [
            {"fieldname": "garage_reason", "fieldtype": "Data", "label": _("Reason"), "reqd": 1},
            {"fieldname": "damage_description", "fieldtype": "Small Text", "label": _("Damage Description")},
        ],
        
        # Any state -> Under Maintenance
        ("Available", "Under Maintenance"): [
            {"fieldname": "service_type", "fieldtype": "Link", "options": "Service Types", "label": _("Service Type"), "reqd": 1},
            {"fieldname": "description", "fieldtype": "Data", "label": _("Description"), "reqd": 1},
            {"fieldname": "date", "fieldtype": "Date", "label": _("Service Date"), "reqd": 1},
            {"fieldname": "cost", "fieldtype": "Currency", "label": _("Estimated Cost")},
            {"fieldname": "vendor", "fieldtype": "Link", "options": "Supplier", "label": _("Vendor")},
            {"fieldname": "note", "fieldtype": "Small Text", "label": _("Notes")},
        ],
        ("At Garage", "Under Maintenance"): [
            {"fieldname": "service_type", "fieldtype": "Link", "options": "Service Types", "label": _("Service Type"), "reqd": 1},
            {"fieldname": "description", "fieldtype": "Data", "label": _("Description"), "reqd": 1},
            {"fieldname": "date", "fieldtype": "Date", "label": _("Service Date"), "reqd": 1},
            {"fieldname": "cost", "fieldtype": "Currency", "label": _("Estimated Cost")},
            {"fieldname": "vendor", "fieldtype": "Link", "options": "Supplier", "label": _("Vendor")},
        ],
        
        # Any state -> Accident/Repair
        ("Available", "Accident/Repair"): [
            {"fieldname": "accident_date", "fieldtype": "Date", "label": _("Accident Date"), "reqd": 1},
            {"fieldname": "accident_description", "fieldtype": "Small Text", "label": _("Accident Description"), "reqd": 1},
            {"fieldname": "repair_cost", "fieldtype": "Currency", "label": _("Estimated Repair Cost")},
            {"fieldname": "insurance_claim", "fieldtype": "Check", "label": _("Insurance Claim")},
        ],
        ("Rented Out", "Accident/Repair"): [
            {"fieldname": "accident_date", "fieldtype": "Date", "label": _("Accident Date"), "reqd": 1},
            {"fieldname": "accident_description", "fieldtype": "Small Text", "label": _("Accident Description"), "reqd": 1},
            {"fieldname": "driver_involved", "fieldtype": "Link", "options": "Customer", "label": _("Driver Involved")},
            {"fieldname": "repair_cost", "fieldtype": "Currency", "label": _("Estimated Repair Cost")},
            {"fieldname": "insurance_claim", "fieldtype": "Check", "label": _("Insurance Claim")},
        ],
        
        # Under Maintenance -> Available
        ("Under Maintenance", "Available"): [
            {"fieldname": "service_completed", "fieldtype": "Check", "label": _("Service Completed"), "reqd": 1},
            {"fieldname": "completion_notes", "fieldtype": "Small Text", "label": _("Completion Notes")},
        ],
        
        # Accident/Repair -> Available
        ("Accident/Repair", "Available"): [
            {"fieldname": "repair_completed", "fieldtype": "Check", "label": _("Repair Completed"), "reqd": 1},
            {"fieldname": "repair_notes", "fieldtype": "Small Text", "label": _("Repair Notes")},
            {"fieldname": "final_cost", "fieldtype": "Currency", "label": _("Final Repair Cost")},
        ],
        
        # At Garage -> Available
        ("At Garage", "Available"): [
            {"fieldname": "garage_clearance", "fieldtype": "Check", "label": _("Cleared for Use"), "reqd": 1},
            {"fieldname": "clearance_notes", "fieldtype": "Small Text", "label": _("Clearance Notes")},
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


def create_accident_service_record(vehicle, data):
    """
    Create a Service document for accident/repair
    """
    description = f"Accident/Repair - {data.get('accident_description', 'No description')}"
    
    service = frappe.get_doc({
        "doctype": "Services",
        "vehicle": vehicle.name,
        "service_type": data.get("service_type") or "Repair",
        "description": description,
        "date": data.get("accident_date") or frappe.utils.today(),
        "cost": data.get("repair_cost"),
        "vendor": data.get("vendor"),
        "note": f"Accident Date: {data.get('accident_date')}\nDescription: {data.get('accident_description')}\nInsurance Claim: {data.get('insurance_claim', 'No')}",
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
    
    # Get available fields
    vehicles_meta = frappe.get_meta("Vehicles")
    available_fields = {field.fieldname for field in vehicles_meta.fields}
    available_fields.add("name")
    
    # Build safe field list
    select_fields = ["name"]
    search_fields = []
    
    if "license_plate" in available_fields:
        select_fields.append("license_plate")
        search_fields.append("license_plate")
    if "model" in available_fields:
        select_fields.append("model")
        search_fields.append("model")
    if "chassis_number" in available_fields:
        select_fields.append("chassis_number")
        search_fields.append("chassis_number")
    if "workflow_state" in available_fields:
        select_fields.append("workflow_state")
    if "driver" in available_fields:
        select_fields.append("driver")
    if "location" in available_fields:
        select_fields.append("location")
    
    conditions = ["1=1"]
    values = {}
    
    if query and search_fields:
        search_conditions = [f"`{field}` LIKE %(query)s" for field in search_fields]
        conditions.append(f"({' OR '.join(search_conditions)})")
        values["query"] = f"%{query}%"
    
    if filters:
        for key, value in filters.items():
            if key in available_fields and value:
                conditions.append(f"`{key}` = %({key})s")
                values[key] = value
    
    where_clause = " AND ".join(conditions)
    select_clause = ", ".join([f"`{f}`" for f in select_fields])
    
    try:
        vehicles = frappe.db.sql(f"""
            SELECT {select_clause}
            FROM `tabVehicles`
            WHERE {where_clause}
            ORDER BY modified DESC
            LIMIT 20
        """, values, as_dict=True)
        
        return vehicles
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Search Vehicles Error")
        return []
