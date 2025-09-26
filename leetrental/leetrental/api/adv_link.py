# leetrental/leetrental/api/adv_link.py
import frappe
from frappe import _

@frappe.whitelist()
def smart_search(doctype, txt="", start=0, page_length=20, filters=None):
    filters = frappe.parse_json(filters) if isinstance(filters, str) else (filters or {})
    cond = []
    vals = {"txt": f"%{txt}%"}

    # Example: status filter
    if filters.get("status"):
      cond.append("status = %(status)s")
      vals["status"] = filters["status"]

    where = " AND ".join(["1=1"] + cond)
    res = frappe.db.sql(f"""
      SELECT name as value,
             description,        -- ensure field exists or replace
             owner
        FROM `tab{doctype}`
       WHERE ({'name like %(txt)s OR description like %(txt)s'})
         AND {where}
       ORDER BY modified desc
       LIMIT %(start)s, %(page_length)s
    """, {**vals, "start": int(start), "page_length": int(page_length)}, as_dict=True)
    return res
