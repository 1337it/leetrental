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
    """
    Azure DI ID response has 'documents' with fields like FirstName, LastName, DocumentNumber, DateOfBirth, ExpirationDate, etc.
    We normalize to your Customer fields.
    Docs: Identity Document (ID) prebuilt model.  [oai_citation:4‡Microsoft Learn](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/id-document?view=doc-intel-4.0.0&utm_source=chatgpt.com)
    """
    out = {}
    docs = (analysis_json.get("analyzeResult") or {}).get("documents") or []
    if not docs:
        return out
    d0 = docs[0]
    fields = d0.get("fields", {})

    def getv(key):
        v = fields.get(key) or {}
        # value can be under 'content' or typed 'valueString'/'valueDate'
        return v.get("valueString") or v.get("content") or v.get("valueDate")

    # Common
    out["first_name"]  = getv("FirstName")
    out["last_name"]   = getv("LastName")
    out["full_name"]   = getv("FullName")
    out["date_of_birth"] = str(getv("DateOfBirth") or "")[:10] or None
    out["nationality"] = getv("Nationality")
    out["gender"]      = getv("Sex") or getv("Gender")
    out["address_line1"]= getv("Address")
    out["city"]        = getv("PlaceOfBirth") or None
    out["country"]     = getv("CountryRegion") or None

    # Passport
    out["passport_number"] = getv("DocumentNumber")
    out["passport_expiry"] = str(getv("DateOfExpiration") or "")[:10] or None
    out["passport_issuer"] = getv("IssuingCountry")

    # Driving License
    out["driver_license_number"] = getv("DocumentNumber") if not out.get("passport_number") else None
    out["license_expiry"] = out.get("passport_expiry")  # reuse if DL
    out["issuing_authority"] = getv("Authority")

    # National ID
    out["national_id_number"] = getv("DocumentNumber") if not (out.get("passport_number") or out.get("driver_license_number")) else None
    out["id_expiry"] = out.get("passport_expiry")  # reuse if ID

    # Optional: confidence (overall or per-field)
    conf = d0.get("confidence")
    if conf is not None:
        out["ocr_confidence"] = round(float(conf), 3)

    # Normalize gender
    g = (out.get("gender") or "").strip().upper()
    out["gender"] = "Male" if g in ("M","MALE") else ("Female" if g in ("F","FEMALE") else None)
    return out
