import frappe
from frappe.utils import cint

@frappe.whitelist()
def get_vehicle_movements(vehicle: str, from_date=None, to_date=None, movement_type=None, page=1, page_len=10):
    if not frappe.has_permission('Vehicle Movements', 'read'):
        frappe.throw('Not permitted', frappe.PermissionError)

    page = cint(page) or 1
    page_len = cint(page_len) or 10
    start = (page - 1) * page_len

    conditions = ["vm.vehicle = %(vehicle)s"]
    params = {"vehicle": vehicle}

    if from_date:
        conditions.append("vm.date >= %(from_date)s")
        params["from_date"] = from_date
    if to_date:
        conditions.append("vm.date <= %(to_date)s")
        params["to_date"] = to_date
    if movement_type:
        conditions.append("vm.movement_type = %(movement_type)s")
        params["movement_type"] = movement_type

    where = " AND ".join(conditions)

    # Count
    total = frappe.db.sql(
        f"SELECT COUNT(*) FROM `tabVehicle Movements` vm WHERE {where}",
        params
    )[0][0]

    # Data
    data = frappe.db.sql(
        f"""
        SELECT
            vm.name,
            vm.movement_id,
            vm.date,
            vm.vehicle,
            vm.movement_type,
            vm.movement_subtype,
            vm.purchase_order_no,
            vm.agreement_no,
            vm.manual_agreement_no,
            vm.pickup_location,
            vm.drop_location,
            vm.workshop,
            vm.unit,
            vm.odometer_value,

            vm.out_date_time,
            vm.out_from,
            vm.out_branch,
            vm.out_customer,
            vm.out_staff,
            vm.out_driver,
            vm.out_mileage,
            vm.out_fuel_level,
            vm.out_notes,

            vm.in_date_time,
            vm.in_to,
            vm.in_branch,
            vm.in_customer,
            vm.in_staff,
            vm.in_driver,
            vm.in_mileage,
            vm.in_fuel_level,
            vm.in_notes,

            vm.service_done
        FROM `tabVehicle Movements` vm
        WHERE {where}
        ORDER BY vm.date DESC, vm.out_date_time DESC, vm.modified DESC
        LIMIT %(start)s, %(limit)s
        """,
        {**params, "start": start, "limit": page_len},
        as_dict=True
    )

    return {"total": total, "data": data}
