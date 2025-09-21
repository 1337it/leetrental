# leet_integrations/azure_di.py
import frappe, json, requests, time
from frappe.utils.file_manager import get_file_path

AZ_API = "2024-07-31"  # choose a GA version available to your resource
ID_MODEL = "prebuilt-id"  # Azure prebuilt Identity Document model.  [oai_citation:2‡Microsoft Learn](https://learn.microsoft.com/en-us/azure/ai-services/document-intelligence/prebuilt/id-document?view=doc-intel-4.0.0&utm_source=chatgpt.com)

def _cfg():
    sc = frappe.get_site_config()
    return sc.get("azure_di_endpoint"), sc.get("azure_di_key")

@frappe.whitelist()
def extract_and_update_customer(customer: str, file_url: str, rename_customer: int = 0, debug: int = 0):
    frappe.only_for(("System Manager","Sales Manager","Sales User","Administrator"))
    endpoint, key = _cfg()
    if not (endpoint and key):
        raise frappe.ValidationError("Azure DI endpoint/key missing in site_config.json")

    # 1) Load binary
    path = get_file_path(file_url)
    with open(path, "rb") as f: data = f.read()

    # 2) Submit analyze request (async)
    url = f"{endpoint}documentintelligence/documentModels/prebuilt-read:analyze?_overload=analyzeDocument&api-version=2024-11-30"
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
    analyze = result.get("analyzeResult") or {}
    docs = analyze.get("documents") or []
    f = (docs[0].get("fields", {}) if docs else {}) or {}

    if int(debug):
        # Log keys + a few short values
        sample = {}
        for k, v in list(f.items())[:10]:
            txt = v.get("valueString") or v.get("content") or v.get("valueDate") or ""
            sample[k] = (txt[:24] + "…") if isinstance(txt, str) and len(txt) > 25 else txt
            frappe.log_error(f"""
    Azure ID OCR DEBUG
    status: {result.get('status')}
    doc_count: {len(docs)}
    field_keys: {list(f.keys())}
    sample: {sample}
    """, "Azure ID OCR")
        # also return to client
        return {"debug_keys": list(f.keys()), "debug_sample": sample}

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

ALIASES = {
    "first_name":  ["FirstName","GivenName","GivenNames","Forename","NameFirst"],
    "last_name":   ["LastName","Surname","FamilyName","NameLast"],
    "full_name":   ["FullName","Name","NameFull"],
    "dob":         ["DateOfBirth","BirthDate","DOB"],
    "gender":      ["Sex","Gender"],
    "nationality": ["Nationality","Nationalities"],
    "country":     ["CountryRegion","Country","IssuingCountry","IssuingState"],
    "address":     ["Address","AddressLine","Address1","AddressLine1"],
    "city":        ["PlaceOfBirth","City","Town"],
    "doc_no":      ["DocumentNumber","IDNumber","LicenseNumber","PersonalNumber","CardNumber","Number"],
    "expiry":      ["DateOfExpiration","ExpirationDate","ExpiryDate","ValidUntil","ValidTo"],
    "issuer":      ["IssuingCountry","IssuingAuthority","Authority","Issuer","IssuingState"],
    "doctype":     ["DocumentType","Type","Category"]
}

def _v(fields, *keys):
    for k in keys:
        d = fields.get(k) or {}
        val = d.get("valueString") or d.get("content") or d.get("valueDate")
        if val: return str(val).strip()
    return None

def _first_present(fields, candidates):
    return _v(fields, *candidates)

def _any_text_match(fields, pattern):
    rx = re.compile(pattern, re.I)
    for k, d in fields.items():
        if rx.search(k):
            val = d.get("valueString") or d.get("content") or d.get("valueDate")
            if val: return str(val).strip()
    return None
def map_azure_id_to_customer(analysis_json: dict) -> dict:
    out = {}
    docs = (analysis_json.get("analyzeResult") or {}).get("documents") or []
    if not docs:
        return out
    fields = docs[0].get("fields", {}) or {}

    # Preferred via aliases
    first = _first_present(fields, ALIASES["first_name"]) or _any_text_match(fields, r"first|given")
    last  = _first_present(fields, ALIASES["last_name"])  or _any_text_match(fields, r"last|family|sur")
    full  = _first_present(fields, ALIASES["full_name"])  or ("{} {}".format(first or "", last or "").strip() or None)

    dob   = _first_present(fields, ALIASES["dob"]) or _any_text_match(fields, r"birth|dob")
    g     = (_first_present(fields, ALIASES["gender"]) or "").upper()

    nat   = _first_present(fields, ALIASES["nationality"])
    ctry  = _first_present(fields, ALIASES["country"])
    addr  = _first_present(fields, ALIASES["address"])
    city  = _first_present(fields, ALIASES["city"])

    docno = _first_present(fields, ALIASES["doc_no"]) or _any_text_match(fields, r"(document|license|card).*(no|number)")
    exp   = _first_present(fields, ALIASES["expiry"]) or _any_text_match(fields, r"(expir|valid).*")
    issu  = _first_present(fields, ALIASES["issuer"])
    dtype = (_first_present(fields, ALIASES["doctype"]) or "").lower()

    # Assign
    out["first_name"] = first or None
    out["last_name"]  = last or None
    out["full_name"]  = full or None
    out["customer_name"] = full or first or last

    out["date_of_birth"] = (dob[:10] if dob else None)
    out["gender"] = "Male" if g in ("M","MALE") else ("Female" if g in ("F","FEMALE") else None)
    out["nationality"] = nat
    out["country"] = ctry
    out["address_line1"] = addr
    out["city"] = city

    # Map to all three doc types; whichever applies will be non-empty
    out["passport_number"] = docno
    out["passport_expiry"] = (exp[:10] if exp else None)
    out["passport_issuer"] = issu
    if "license" in dtype:
        out["driver_license_number"] = docno
        out["license_expiry"] = out["passport_expiry"]
        out["issuing_authority"] = issu
    if "id" in dtype or "emirates" in dtype:
        out["national_id_number"] = docno
        out["id_expiry"] = out["passport_expiry"]
        out["id_issuer"] = issu

    # Confidence
    conf = docs[0].get("confidence")
    if conf is not None:
        out["ocr_confidence"] = round(float(conf), 3)

    # Remove empties
    return {k:v for k,v in out.items() if v not in (None,"")}
