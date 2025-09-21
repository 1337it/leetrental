# leet_integrations/azure_di.py
import frappe, json, requests, time
from frappe.utils.file_manager import get_file_path

AZ_API = "2024-07-31"  # choose a GA version available to your resource
ID_MODEL = "prebuilt-id"  # Azure prebuilt Identity Document model.  [oai_citation:2‡Microsoft Learn](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/id-document?view=doc-intel-4.0.0&utm_source=chatgpt.com)

def _cfg():
    sc = frappe.get_site_config()
    return sc.get("azure_di_endpoint"), sc.get("azure_di_key")

@frappe.whitelist()
def extract_and_update_customer(customer: str, file_url: str):
    frappe.only_for(("System Manager","Sales Manager","Sales User","Administrator"))
    endpoint, key = _cfg()
    if not (endpoint and key):
        raise frappe.ValidationError("Azure DI endpoint/key missing in site_config.json")

    # 1) Load binary
    path = get_file_path(file_url)
    with open(path, "rb") as f: data = f.read()

    # 2) Submit analyze request (async)
    url = f"{endpoint}documentintelligence/documentModels/prebuilt-layout:analyze?_overload=analyzeDocument&api-version=2024-11-30"
    headers = {"Ocp-Apim-Subscription-Key": key, "Content-Type": "application/octet-stream"}
    post = requests.post(url, headers=headers, data=data)
    post.raise_for_status()
    op_loc = post.headers.get("Operation-Location")  # poll URL.  [oai_citation:3‡Microsoft Learn](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/concept/analyze-document-response?view=doc-intel-4.0.0&utm_source=chatgpt.com)
    if not op_loc:
        raise frappe.ValidationError("Azure did not return Operation-Location")

    # 3) Poll for completion
    for _ in range(30):
        res = requests.get(op_loc, headers={"Ocp-Apim-Subscription-Key": key})
        res.raise_for_status()
        j = res.json()
        if j.get("status") in ("succeeded","failed"):
            result = j
            # right after `result = j` in your polling loop:
            frappe.log_error(json.dumps({
                "status": result.get("status"),
                "doc_count": len((result.get("analyzeResult") or {}).get("documents") or []),
                "field_keys": list(((result.get("analyzeResult") or {}).get("documents") or [{}])[0].get("fields", {}).keys())
            }, ensure_ascii=False, indent=2), "Azure ID OCR – debug")
            break
        time.sleep(1.0)
    else:
        raise frappe.ValidationError("Azure analysis timed out")

    if result.get("status") != "succeeded":
        raise frappe.ValidationError("Azure analysis failed")

    # 4) Map fields → Frappe
    mapped = map_azure_id_to_customer(result)
    # Remove Nones
    mapped = {k:v for k,v in mapped.items() if v not in (None,"")}
    # Update customer
    if mapped:
        frappe.db.set_value("Customer", customer, mapped)
        frappe.db.commit()

    # 5) Attach original
    _attach(customer, file_url)

    return mapped

def _attach(customer, file_url):
    f = frappe.new_doc("File")
    f.file_url = file_url
    f.attached_to_doctype = "Customer"
    f.attached_to_name = customer
    f.insert(ignore_permissions=True)

def map_azure_id_to_customer(analysis_json: dict) -> dict:
    out = {}
    docs = (analysis_json.get("analyzeResult") or {}).get("documents") or []
    if not docs:
        return out
    f = docs[0].get("fields", {}) or {}

    def val(*candidates):
        for k in candidates:
            v = f.get(k) or {}
            x = v.get("valueString") or v.get("content") or v.get("valueDate")
            if x: return str(x).strip()
        return None

    # Names (try multiple aliases)
    first = val("FirstName","GivenName","GivenNames","Forename")
    last  = val("LastName","Surname","FamilyName")
    full  = val("FullName","Name") or ("{} {}".format(first or "", last or "").strip() or None)

    out["first_name"] = first
    out["last_name"]  = last
    out["full_name"]  = full
    out["customer_name"] = full or first or last

    # DOB / Gender
    dob = val("DateOfBirth","BirthDate","DOB")
    out["date_of_birth"] = (dob[:10] if dob else None)
    g = (val("Sex","Gender") or "").upper()
    out["gender"] = "Male" if g in ("M","MALE") else ("Female" if g in ("F","FEMALE") else None)

    # Nationality, Country, Address
    out["nationality"]   = val("Nationality","Nationalities")
    out["country"]       = val("CountryRegion","Country","IssuingCountry","IssuingState")
    out["address_line1"] = val("Address","AddressLine","Address1")
    out["city"]          = val("PlaceOfBirth","City")

    # Document number & expiry (cover passports, DL, IDs)
    doc_no = val("DocumentNumber","IDNumber","LicenseNumber","PersonalNumber")
    exp    = val("DateOfExpiration","ExpirationDate","ExpiryDate","ValidUntil")
    out["passport_number"]          = doc_no
    out["passport_expiry"]          = (exp[:10] if exp else None)
    out["passport_issuer"]          = val("IssuingCountry","IssuingAuthority","Authority")

    # If it looks like a DL instead of passport, copy to DL fields
    if out["passport_number"] and "license" in (val("DocumentType","Description") or "").lower():
        out["driver_license_number"] = out["passport_number"]
        out["license_expiry"]        = out["passport_expiry"]
        out["issuing_authority"]     = out["passport_issuer"]

    # If it looks like a National ID, map accordingly
    if val("DocumentType") and "id" in val("DocumentType").lower():
        out["national_id_number"] = out["passport_number"]
        out["id_expiry"]          = out["passport_expiry"]

    # Confidence (overall document)
    conf = docs[0].get("confidence")
    if conf is not None:
        out["ocr_confidence"] = round(float(conf), 3)

    # Strip empties
    return {k:v for k,v in out.items() if v not in (None, "")}
