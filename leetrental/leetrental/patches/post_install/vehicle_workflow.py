# leetrental/leetrental/patches/post_install/vehicle_workflow.py

import frappe

def execute():
    ensure_roles([
        "Rental Agent",
        "Delivery Agent",
        "Service Advisor",
        "Fleet Manager",
    ])
    ensure_vehicle_status_field()
    ensure_vehicle_status_sync_script()
    ensure_workflow_states()          # <-- NEW: create Workflow State docs first
    ensure_vehicle_workflow()

def ensure_roles(role_names):
    for rn in role_names:
        if not frappe.db.exists("Role", rn):
            frappe.get_doc({"doctype": "Role", "role_name": rn}).insert(ignore_permissions=True)

def ensure_vehicle_status_field():
    if frappe.db.exists("Custom Field", "Vehicle-status"):
        return
    options = "\n".join([
        "Available",
        "Reserved",
        "Out for Delivery",
        "Rented Out",
        "Due for Return",
        "Custody",
        "At Garage",
        "Under Maintenance",
        "Accident/Repair",
        "Deactivated",
    ])
    cf = frappe.get_doc({
        "doctype": "Custom Field",
        "name": "Vehicle-status",
        "dt": "Vehicle",
        "fieldname": "status",
        "label": "Status",
        "fieldtype": "Select",
        "options": options,
        "default": "Available",
        "insert_after": "model",
        "read_only": 1,
        "reqd": 1,
        "no_copy": 1,
        "in_list_view": 1,
        "in_standard_filter": 1,
    })
    cf.insert(ignore_permissions=True)
    frappe.clear_cache(doctype="Vehicle")

def ensure_vehicle_status_sync_script():
    name = "Vehicle Status Sync"
    script_body = (
        "import frappe\n"
        "def before_save(doc, method=None):\n"
        "    if getattr(doc, 'workflow_state', None):\n"
        "        if doc.status != doc.workflow_state:\n"
        "            doc.status = doc.workflow_state\n"
    )
    if frappe.db.exists("Server Script", name):
        doc = frappe.get_doc("Server Script", name)
        doc.script_type = "DocType Event"
        doc.reference_doctype = "Vehicle"
        doc.event = "Before Save"
        doc.enabled = 1
        doc.script = script_body
        doc.save(ignore_permissions=True)
    else:
        frappe.get_doc({
            "doctype": "Server Script",
            "name": name,
            "script_type": "DocType Event",
            "reference_doctype": "Vehicle",
            "event": "Before Save",
            "enabled": 1,
            "script": script_body,
        }).insert(ignore_permissions=True)

# NEW: create Workflow State docs (names must exist before linking from Workflow rows)
def ensure_workflow_states():
    style_map = {
        "Available": "Success",
        "Reserved": "Warning",
        "Out for Delivery": "Primary",
        "Rented Out": "Primary",
        "Due for Return": "Warning",
        "Custody": "Default",
        "At Garage": "Warning",
        "Under Maintenance": "Danger",
        "Accident/Repair": "Danger",
        "Deactivated": "Muted",
    }
    for state, style in style_map.items():
        if not frappe.db.exists("Workflow State", state):
            frappe.get_doc({
                "doctype": "Workflow State",
                "workflow_state_name": state,   # some versions accept this
                "name": state,                  # ensure name is exactly the state text
                "style": style,
                "is_default": 0,
            }).insert(ignore_permissions=True)

def ensure_vehicle_workflow():
    wf_name = "Vehicle Status Workflow"

    # create or reset
    if frappe.db.exists("Workflow", wf_name):
        wf = frappe.get_doc("Workflow", wf_name)
        wf.states = []
        wf.transitions = []
    else:
        wf = frappe.get_doc({
            "doctype": "Workflow",
            "workflow_name": wf_name,
            "document_type": "Vehicle",
            "is_active": 1,
            "override_status": 0,
            "send_email_alert": 0,
            "workflow_state_field": "workflow_state",
        })

    def add_state(state, roles, update_field="status", update_value=None, doc_status=0):
        row = wf.append("states", {})
        row.state = state                  # Link to existing Workflow State
        row.doc_status = doc_status
        row.update_field = update_field
        row.update_value = update_value or state
        for r in roles:
            ar = row.append("allow_edit", {})
            ar.role = r                    # Link to Role

    def add_transition(from_state, action, to_state, allowed_roles, allow_self_approval=1, condition=None):
        for role in allowed_roles:
            tr = wf.append("transitions", {})
            tr.state = from_state          # Link to Workflow State
            tr.action = action
            tr.next_state = to_state       # Link to Workflow State
            tr.allowed = role              # Link to Role
            tr.allow_self_approval = allow_self_approval
            if condition:
                tr.condition = condition

    # States (names MUST match the Workflow State docs just created)
    add_state("Available",         ["Rental Agent", "Fleet Manager"])
    add_state("Reserved",          ["Rental Agent", "Fleet Manager"])
    add_state("Out for Delivery",  ["Delivery Agent", "Fleet Manager"])
    add_state("Rented Out",        ["Rental Agent", "Fleet Manager"])
    add_state("Due for Return",    ["Rental Agent", "Fleet Manager"])
    add_state("Custody",           ["Fleet Manager"])
    add_state("At Garage",         ["Service Advisor", "Fleet Manager"])
    add_state("Under Maintenance", ["Service Advisor", "Fleet Manager"])
    add_state("Accident/Repair",   ["Service Advisor", "Fleet Manager"])
    add_state("Deactivated",       ["Fleet Manager"])

    # Transitions
    add_transition("Available",        "Reserve",              "Reserved",          ["Rental Agent", "Fleet Manager"])
    add_transition("Reserved",         "Cancel Reservation",   "Available",         ["Rental Agent", "Fleet Manager"])
    add_transition("Reserved",         "Dispatch",             "Out for Delivery",  ["Rental Agent", "Fleet Manager"])
    add_transition("Available",        "Dispatch",             "Out for Delivery",  ["Rental Agent", "Fleet Manager"])
    add_transition("Out for Delivery", "Hand Over",            "Rented Out",        ["Delivery Agent", "Fleet Manager"])
    add_transition("Rented Out",       "Mark Due for Return",  "Due for Return",    ["Rental Agent", "Fleet Manager"])
    add_transition("Due for Return",   "Return Completed",     "Available",         ["Rental Agent", "Fleet Manager"])
    add_transition("Rented Out",       "Send to Garage",       "At Garage",         ["Fleet Manager", "Service Advisor"])
    add_transition("At Garage",        "Start Maintenance",    "Under Maintenance", ["Service Advisor", "Fleet Manager"])
    add_transition("Under Maintenance","Job Done",             "Available",         ["Service Advisor", "Fleet Manager"])
    add_transition("At Garage",        "Accident/Repair",      "Accident/Repair",   ["Service Advisor", "Fleet Manager"])
    add_transition("Accident/Repair",  "Repair Completed",     "Available",         ["Service Advisor", "Fleet Manager"])
    add_transition("Available",        "Move to Custody",      "Custody",           ["Fleet Manager"])
    add_transition("Custody",          "Release to Fleet",     "Available",         ["Fleet Manager"])
    add_transition("Available",        "Deactivate",           "Deactivated",       ["Fleet Manager"])
    add_transition("Deactivated",      "Reactivate",           "Available",         ["Fleet Manager"])

    wf.workflow_name = wf_name
    wf.document_type = "Vehicle"
    wf.is_active = 1
    wf.workflow_state_field = "workflow_state"

    if wf.get("name"):
        wf.save(ignore_permissions=True)
    else:
        wf.insert(ignore_permissions=True)
