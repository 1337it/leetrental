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
    
    # Get workflow states from vehicle_status field options in Vehicles doctype
    vehicles_meta = frappe.get_meta("Vehicles")
    vehicle_status_field = vehicles_meta.get_field("vehicle_status")
    
    workflow_states = []
    if vehicle_status_field and vehicle_status_field.options:
        # Options are stored as newline-separated values
        options_list = vehicle_status_field.options.split('\n')
        for idx, option in enumerate(options_list):
            option = option.strip()
            if option:  # Skip empty lines
                workflow_states.append({
                    "name": option,
                    "style": "default",  # You can map specific styles if needed
                    "idx": idx
                })
    
    # Fallback if no options found
    if not workflow_states:
        workflow_states = [{"name": "Draft", "style": "default", "idx": 0}]
    
    # Get available fields
    available_fields = {field.fieldname for field in vehicles_meta.fields}
    available_fields.add("name")  # Always available
    
    # Build field list dynamically
    base_fields = ["name", "license_plate", "chassis_number"]
    
    # Use vehicle_status instead of workflow_state
    if "vehicle_status" in available_fields:
        base_fields.append("vehicle_status")
    elif "workflow_state" in available_fields:
        base_fields.append("workflow_state")
    
    optional_fields = {
        "model": "model",
        "driver": "driver", 
        "location": "location",
        "last_odometer_value": "last_odometer_value",
        "color": "color",
        "model_year": "model_year",
        "fuel_type": "fuel_type",
        "tags": "tags",
        "upload_photo": "image",
        "image_5": "image"
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
            
            # Ensure all expected fields exist with defaults
            vehicle.setdefault("model", None)
            vehicle.setdefault("driver", None)
            vehicle.setdefault("location", None)
            vehicle.setdefault("last_odometer_value", 0)
            vehicle.setdefault("color", None)
            vehicle.setdefault("model_year", None)
            vehicle.setdefault("fuel_type", None)
            vehicle.setdefault("tags", None)
            
            # Normalize status field name
            if "vehicle_status" in vehicle:
                vehicle["workflow_state"] = vehicle.get("vehicle_status") or "Draft"
            else:
                vehicle.setdefault("workflow_state", "Draft")
        
    except Exception as e:
        frappe.log_error(frappe.get_traceback(), "Get Kanban Data Error")
        vehicles = []
    
    # Group vehicles by workflow state
    kanban_data = {}
    for state in workflow_states:
        kanban_data[state["name"]] = {
            "label": state["name"],
            "style": state.get("style", "default"),
            "vehicles": []
        }
    
    # Add vehicles to their respective columns
    for vehicle in vehicles:
        state = vehicle.get("workflow_state") or "Draft"
        if state in kanban_data:
            kanban_data[state]["vehicles"].append(vehicle)
        else:
            # Handle vehicles with states not in the options
            if "Other" not in kanban_data:
                kanban_data["Other"] = {
                    "label": "Other",
                    "style": "default",
                    "vehicles": []
                }
            kanban_data["Other"]["vehicles"].append(vehicle)
    
    return kanban_data


# Helper function to get vehicle status options
def get_vehicle_status_options():
    """
    Get the vehicle_status field options from Vehicles doctype
    Returns a list of status options
    """
    vehicles_meta = frappe.get_meta("Vehicles")
    vehicle_status_field = vehicles_meta.get_field("vehicle_status")
    
    if vehicle_status_field and vehicle_status_field.options:
        options_list = [opt.strip() for opt in vehicle_status_field.options.split('\n') if opt.strip()]
        return options_list
    
    return []


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
            "message": _("Transition from {0} to {1} is not allowed").format(from_state, to_state)
        }
    
    return {"valid": True, "message": "Transition allowed"}


def get_required_fields_for_transition(from_state, to_state):
    """
    Return required fields based on the transition
    Dynamically loads field requirements from vehicle_status options
    
    Vehicle Status Options:
    - Available
    - Reserved
    - Out for Delivery
    - Rented Out
    - Due for Return
    - Returned (Inspection)
    - At Garage
    - Under Maintenance
    - Accident/Repair
    - Deactivated
    """
    # Get all available status options from vehicle_status field
    available_statuses = get_vehicle_status_options()
    
    # Define fields map based on actual vehicle statuses
    fields_map = {
        # Available -> Reserved: Create reservation
        ("Available", "Reserved"): [
            {"fieldname": "driver", "fieldtype": "Link", "options": "Customer", "label": _("Customer"), "reqd": 1},
            {"fieldname": "start_time", "fieldtype": "Datetime", "label": _("Reservation Start"), "reqd": 1},
            {"fieldname": "end_time", "fieldtype": "Datetime", "label": _("Reservation End"), "reqd": 1},
            {"fieldname": "pickup_location", "fieldtype": "Link", "options": "Reservation Locations", "label": _("Pickup Location")},
            {"fieldname": "drop_location", "fieldtype": "Link", "options": "Reservation Locations", "label": _("Drop Location")},
        ],
        
        # Reserved -> Out for Delivery: Prepare for delivery
        ("Reserved", "Out for Delivery"): [
            {"fieldname": "delivery_driver", "fieldtype": "Link", "options": "Employee", "label": _("Delivery Driver")},
            {"fieldname": "delivery_time", "fieldtype": "Datetime", "label": _("Delivery Time"), "reqd": 1},
            {"fieldname": "delivery_location", "fieldtype": "Data", "label": _("Delivery Address")},
        ],
        
        # Out for Delivery -> Rented Out: Complete handover
        ("Out for Delivery", "Rented Out"): [
            {"fieldname": "agreement_no", "fieldtype": "Data", "label": _("Agreement No"), "reqd": 1},
            {"fieldname": "out_customer", "fieldtype": "Link", "options": "Customer", "label": _("Customer"), "reqd": 1},
            {"fieldname": "out_date_time", "fieldtype": "Datetime", "label": _("Handover Date & Time"), "reqd": 1},
            {"fieldname": "out_mileage", "fieldtype": "Int", "label": _("Starting Mileage (KM)"), "reqd": 1},
            {"fieldname": "out_fuel_level", "fieldtype": "Select", "options": "Empty\n1/4\n1/2\n3/4\nFull", "label": _("Fuel Level at Handover")},
            {"fieldname": "out_from", "fieldtype": "Data", "label": _("Handover Location")},
        ],
        
        # Reserved -> Rented Out: Direct rental (skip delivery)
        ("Reserved", "Rented Out"): [
            {"fieldname": "agreement_no", "fieldtype": "Data", "label": _("Agreement No"), "reqd": 1},
            {"fieldname": "out_customer", "fieldtype": "Link", "options": "Customer", "label": _("Customer"), "reqd": 1},
            {"fieldname": "out_date_time", "fieldtype": "Datetime", "label": _("Handover Date & Time"), "reqd": 1},
            {"fieldname": "out_mileage", "fieldtype": "Int", "label": _("Starting Mileage (KM)"), "reqd": 1},
            {"fieldname": "out_fuel_level", "fieldtype": "Select", "options": "Empty\n1/4\n1/2\n3/4\nFull", "label": _("Fuel Level at Handover")},
            {"fieldname": "out_from", "fieldtype": "Data", "label": _("Handover Location")},
        ],
        
        # Rented Out -> Due for Return: Mark as due
        ("Rented Out", "Due for Return"): [
            {"fieldname": "expected_return_date", "fieldtype": "Datetime", "label": _("Expected Return Date"), "reqd": 1},
            {"fieldname": "return_location", "fieldtype": "Data", "label": _("Return Location")},
            {"fieldname": "reminder_sent", "fieldtype": "Check", "label": _("Reminder Sent to Customer")},
        ],
        
        # Due for Return -> Returned (Inspection): Vehicle returned
        ("Due for Return", "Returned (Inspection)"): [
            {"fieldname": "return_date_time", "fieldtype": "Datetime", "label": _("Actual Return Date & Time"), "reqd": 1},
            {"fieldname": "return_mileage", "fieldtype": "Int", "label": _("Return Mileage (KM)"), "reqd": 1},
            {"fieldname": "return_fuel_level", "fieldtype": "Select", "options": "Empty\n1/4\n1/2\n3/4\nFull", "label": _("Fuel Level at Return")},
            {"fieldname": "inspector", "fieldtype": "Link", "options": "Employee", "label": _("Inspector")},
        ],
        
        # Returned (Inspection) -> Available: Clean, no issues
        ("Returned (Inspection)", "Available"): [
            {"fieldname": "inspection_date", "fieldtype": "Datetime", "label": _("Inspection Completed"), "reqd": 1},
            {"fieldname": "inspection_notes", "fieldtype": "Small Text", "label": _("Inspection Notes")},
            {"fieldname": "cleanliness_ok", "fieldtype": "Check", "label": _("Vehicle Cleaned"), "reqd": 1},
        ],
        
        # Returned (Inspection) -> At Garage: Issues found
        ("Returned (Inspection)", "At Garage"): [
            {"fieldname": "inspection_date", "fieldtype": "Datetime", "label": _("Inspection Date"), "reqd": 1},
            {"fieldname": "issues_found", "fieldtype": "Small Text", "label": _("Issues Found"), "reqd": 1},
            {"fieldname": "garage_location", "fieldtype": "Link", "options": "Garage", "label": _("Garage Location")},
        ],
        
        # Available -> At Garage: Regular maintenance or inspection
        ("Available", "At Garage"): [
            {"fieldname": "reason", "fieldtype": "Data", "label": _("Reason for Garage"), "reqd": 1},
            {"fieldname": "garage_location", "fieldtype": "Link", "options": "Garage", "label": _("Garage Location")},
            {"fieldname": "expected_duration", "fieldtype": "Int", "label": _("Expected Days")},
        ],
        
        # At Garage -> Under Maintenance: Start maintenance
        ("At Garage", "Under Maintenance"): [
            {"fieldname": "service_type", "fieldtype": "Link", "options": "Service Types", "label": _("Service Type"), "reqd": 1},
            {"fieldname": "description", "fieldtype": "Small Text", "label": _("Work Description"), "reqd": 1},
            {"fieldname": "start_date", "fieldtype": "Date", "label": _("Maintenance Start Date"), "reqd": 1},
            {"fieldname": "estimated_cost", "fieldtype": "Currency", "label": _("Estimated Cost")},
            {"fieldname": "vendor", "fieldtype": "Link", "options": "Supplier", "label": _("Service Vendor")},
        ],
        
        # At Garage -> Accident/Repair: Accident damage found
        ("At Garage", "Accident/Repair"): [
            {"fieldname": "incident_date", "fieldtype": "Date", "label": _("Incident Date"), "reqd": 1},
            {"fieldname": "damage_description", "fieldtype": "Small Text", "label": _("Damage Description"), "reqd": 1},
            {"fieldname": "insurance_claim", "fieldtype": "Data", "label": _("Insurance Claim No")},
            {"fieldname": "estimated_repair_cost", "fieldtype": "Currency", "label": _("Estimated Repair Cost")},
            {"fieldname": "repair_vendor", "fieldtype": "Link", "options": "Supplier", "label": _("Repair Shop")},
        ],
        
        # Rented Out -> Accident/Repair: Accident during rental
        ("Rented Out", "Accident/Repair"): [
            {"fieldname": "incident_date", "fieldtype": "Date", "label": _("Incident Date"), "reqd": 1},
            {"fieldname": "damage_description", "fieldtype": "Small Text", "label": _("Damage Description"), "reqd": 1},
            {"fieldname": "police_report", "fieldtype": "Data", "label": _("Police Report No")},
            {"fieldname": "insurance_claim", "fieldtype": "Data", "label": _("Insurance Claim No")},
            {"fieldname": "customer_liable", "fieldtype": "Check", "label": _("Customer Liable")},
            {"fieldname": "estimated_repair_cost", "fieldtype": "Currency", "label": _("Estimated Repair Cost")},
        ],
        
        # Under Maintenance -> Available: Maintenance completed
        ("Under Maintenance", "Available"): [
            {"fieldname": "completion_date", "fieldtype": "Date", "label": _("Completion Date"), "reqd": 1},
            {"fieldname": "actual_cost", "fieldtype": "Currency", "label": _("Actual Cost"), "reqd": 1},
            {"fieldname": "work_completed", "fieldtype": "Small Text", "label": _("Work Completed")},
            {"fieldname": "invoice_no", "fieldtype": "Data", "label": _("Invoice Number")},
        ],
        
        # Accident/Repair -> Available: Repair completed
        ("Accident/Repair", "Available"): [
            {"fieldname": "repair_completion_date", "fieldtype": "Date", "label": _("Repair Completion Date"), "reqd": 1},
            {"fieldname": "final_repair_cost", "fieldtype": "Currency", "label": _("Final Repair Cost"), "reqd": 1},
            {"fieldname": "repair_summary", "fieldtype": "Small Text", "label": _("Repair Summary")},
            {"fieldname": "quality_check", "fieldtype": "Check", "label": _("Quality Check Passed"), "reqd": 1},
        ],
        
        # Any status -> Deactivated: Remove from fleet
        ("Available", "Deactivated"): [
            {"fieldname": "deactivation_reason", "fieldtype": "Select", "options": "Sold\nWritten Off\nEnd of Lease\nPermanent Damage\nOther", "label": _("Reason"), "reqd": 1},
            {"fieldname": "deactivation_date", "fieldtype": "Date", "label": _("Deactivation Date"), "reqd": 1},
            {"fieldname": "deactivation_notes", "fieldtype": "Small Text", "label": _("Notes")},
        ],
        
        # Deactivated -> Available: Reactivate vehicle
        ("Deactivated", "Available"): [
            {"fieldname": "reactivation_date", "fieldtype": "Date", "label": _("Reactivation Date"), "reqd": 1},
            {"fieldname": "reactivation_reason", "fieldtype": "Small Text", "label": _("Reason for Reactivation"), "reqd": 1},
            {"fieldname": "inspection_completed", "fieldtype": "Check", "label": _("Inspection Completed"), "reqd": 1},
        ],
    }
    
    # Validate that both states exist in vehicle_status options
    if from_state not in available_statuses or to_state not in available_statuses:
        frappe.log_error(
            f"Invalid transition: {from_state} -> {to_state}. "
            f"Available statuses: {', '.join(available_statuses)}",
            "Invalid Vehicle Status Transition"
        )
    
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
