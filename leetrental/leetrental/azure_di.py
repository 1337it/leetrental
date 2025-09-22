import os, re, json, time, requests
import frappe
from frappe.utils.file_manager import get_file_path

# Prefer structured 'prebuilt-id'; fall back to 'prebuilt-read'
API_VER_ID   = "2024-11-30"
API_VER_READ = "2024-11-30"
MODEL_ID     = "prebuilt-id"
MODEL_READ   = "prebuilt-read"

def _cfg():
    sc = frappe.get_site_config()
    return sc.get("azure_di_endpoint"), sc.get("azure_di_key")

# ---------- Azure calls ----------
def _post_analyze_id(endpoint, key, *, url_source=None, file_bytes=None):
    base = f"{endpoint}/documentintelligence/documentModels/{MODEL_ID}:analyze"
    params = {"api-version": API_VER_ID}
    headers = {"Ocp-Apim-Subscription-Key": key}
    if url_source:
        headers["Content-Type"] = "application/json"
        r = requests.post(base, params=params, headers=headers, json={"urlSource": url_source}, timeout=60)
    else:
        headers["Content-Type"] = "application/octet-stream"
        r = requests.post(base, params=params, headers=headers, data=file_bytes, timeout=60)
    r.raise_for_status()
    op_loc = r.headers.get("Operation-Location")
    if not op_loc:
        raise frappe.ValidationError("Azure (ID) did not return Operation-Location")
    return op_loc

def _post_analyze_read(endpoint, key, *, url_source=None, file_bytes=None):
    base = f"{endpoint}/documentintelligence/documentModels/{MODEL_READ}:analyze"
    params = {"api-version": API_VER_READ, "_overload": "analyzeDocument"}
    headers = {"Ocp-Apim-Subscription-Key": key}
    if url_source:
        headers["Content-Type"] = "application/json"
        r = requests.post(base, params=params, headers=headers, json={"urlSource": url_source}, timeout=60)
    else:
        headers["Content-Type"] = "application/octet-stream"
        r = requests.post(base, params=params, headers=headers, data=file_bytes, timeout=60)
    r.raise_for_status()
    op_loc = r.headers.get("Operation-Location")
    if not op_loc:
        raise frappe.ValidationError("Azure (Read) did not return Operation-Location")
    return op_loc

def _poll(op_location, key, timeout_s=90):
    headers = {"Ocp-Apim-Subscription-Key": key}
    t0 = time.time()
    while True:
        rr = requests.get(op_location, headers=headers, timeout=60)
        rr.raise_for_status()
        jj = rr.json()
        st = jj.get("status")
        if st in ("succeeded","failed"):
            return jj
        if time.time() - t0 > timeout_s:
            raise frappe.ValidationError("Azure analyze timed out")
        time.sleep(1)

# ---------- Parsing helpers ----------
def _read_text(result_json):
    ar = result_json.get("analyzeResult") or {}
    paras = ar.get("paragraphs") or []
    if paras:
        return "\n".join([p.get("content","") for p in paras if p.get("content")]).strip()
    if isinstance(ar.get("content"), str) and ar["content"].strip():
        return ar["content"].strip()
    pages = ar.get("pages") or []
    lines=[]
    for pg in pages:
        for ln in pg.get("lines", []):
            if ln.get("content"): lines.append(ln["content"])
    return "\n".join(lines).strip()

DATE_RX = r"(\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})"
def _norm_date(s):
    if not s: return None
    s=s.replace(".", "/").replace("-", "/")
    a=s.split("/")
    if len(a)==3:
        a,b,c=a
        a,b,c=a.zfill(4 if len(a)==4 else 2), b.zfill(2), c.zfill(4)
        if len(a)==4: return f"{a}-{b}-{c}"
        return f"{c}-{b}-{a}"
    return None

def _extract_from_read_text(text):
    """Generic regex fallback for read results."""
    out={}
    # Name
    m=re.search(r"(Full\s*Name|Name)\s*[:\-]\s*([A-Za-z' ]{3,})", text, re.I)
    if m: out["customer_name"] = out["full_name"] = m.group(2).strip()
    else:
        # heuristic uppercase line
        lines=[ln.strip() for ln in text.splitlines() if ln.strip()]
        cand=[ln for ln in lines if ln.replace(" ","").isalpha() and len(ln.split())>=2 and ln.isupper()]
        if cand:
            out["customer_name"] = out["full_name"] = cand[0].title()

    if out.get("full_name"):
        parts=out["full_name"].split()
        out["first_name"]=parts[0]
        if len(parts)>1: out["last_name"]=parts[-1]

    # Numbers
    doc_m=re.search(r"(Passport|Document|ID|Card|License)\s*(No\.?|Number)\s*[:\-]?\s*([A-Z0-9\-]+)", text, re.I)
    if not doc_m: doc_m=re.search(r"\b([A-Z]\d{6,9})\b", text)
    if doc_m: out["generic_number"]=(doc_m.group(3) if doc_m.lastindex and doc_m.lastindex>=3 else doc_m.group(1)).strip()

    # DOB
    m=re.search(r"(DOB|Date\s*of\s*Birth)\s*[:\-]?\s*"+DATE_RX, text, re.I)
    if m: out["date_of_birth"]=_norm_date(m.group(2) if m.lastindex>=2 else m.group(1))

    # Expiry
    m=re.search(r"(Expiry|Expiration|Exp\. Date|Valid\s*Until)\s*[:\-]?\s*"+DATE_RX, text, re.I)
    if m: out["generic_expiry"]=_norm_date(m.group(2) if m.lastindex>=2 else m.group(1))

    # Document type hint
    dtype = "passport"
    if re.search(r"License", text, re.I): dtype = "driving_license"
    if re.search(r"\bID\b|\bEmirates\b|\bNational\b", text, re.I): dtype = "national_id"
    out["doc_type"] = dtype
    return out

def _map_id_fields(doc_json):
    """
    Map Azure prebuilt-id structured result to a common dict:
    doc_type ∈ {passport, driving_license, national_id}
    """
    out={}
    docs = (doc_json.get("analyzeResult") or {}).get("documents") or []
    if not docs:
        return out
    d0 = docs[0]
    fields = d0.get("fields", {}) or {}
    def gx(*keys):
        for k in keys:
            v = fields.get(k) or {}
            val = v.get("valueString") or v.get("content") or v.get("valueDate")
            if val: return str(val).strip()
        return None

    # docType like "idDocument.passport" | "idDocument.driverLicense" | "idDocument.nationalIdentityCard"
    dt = (d0.get("docType") or "").lower()
    if "passport" in dt: out["doc_type"] = "passport"
    elif "driver" in dt: out["doc_type"] = "driving_license"
    elif "identity" in dt or "idcard" in dt: out["doc_type"] = "national_id"

    # names
    full = gx("FullName","Name")
    first = gx("FirstName","GivenName","GivenNames","Forename")
    last  = gx("LastName","Surname","FamilyName")
    out["customer_name"] = full or (f"{first or ''} {last or ''}".strip() or None)
    out["full_name"]     = out["customer_name"]
    out["first_name"]    = first
    out["last_name"]     = last

    # shared
    dob = gx("DateOfBirth","BirthDate","DOB")
    out["date_of_birth"] = (str(dob)[:10] if dob else None)

    # numbers & expiries
    num = gx("DocumentNumber","IDNumber","LicenseNumber","PersonalNumber","CardNumber","Number")
    exp = gx("DateOfExpiration","ExpirationDate","ExpiryDate","ValidUntil","ValidTo")
    out["generic_number"] = num
    out["generic_expiry"] = (str(exp)[:10] if exp else None)
    return out

# ---------- Main entry ----------
@frappe.whitelist()
def apply_scan_to_customer(customer: str, file_url: str, use_urlsource: int = 0, debug: int = 0):
    """
    Analyze a scanned document and populate ONLY empty fields on Customer,
    using your exact field list. Supports adding multiple documents over time.
    """
    frappe.only_for(("System Manager","Sales Manager","Sales User","Administrator"))

    endpoint, key = _cfg()
    if not (endpoint and key):
        raise frappe.ValidationError("Azure endpoint/key missing in site_config.json")

    # Prepare data
    url_source=None; file_bytes=None
    if int(use_urlsource) and file_url.lower().startswith(("http://","https://")):
        url_source=file_url
    else:
        path=get_file_path(file_url)
        if not os.path.exists(path):
            raise frappe.ValidationError(f"File not found: {path}")
        with open(path,"rb") as f: file_bytes=f.read()

    # 1) Try prebuilt-id (structured)
    doc = {}
    try:
        op_loc = _post_analyze_id(endpoint, key, url_source=url_source, file_bytes=file_bytes)
        result = _poll(op_loc, key, timeout_s=90)
        if result.get("status") == "succeeded":
            doc = _map_id_fields(result)
    except Exception as e:
        if int(debug): frappe.log_error(f"prebuilt-id failed: {e}", "Azure ID")

    # 2) Fallback to prebuilt-read + regex if needed
    if not doc.get("doc_type"):
        op_loc = _post_analyze_read(endpoint, key, url_source=url_source, file_bytes=file_bytes)
        result = _poll(op_loc, key, timeout_s=90)
        if result.get("status") == "succeeded":
            text = _read_text(result)
            if int(debug):
                frappe.log_error((text[:3000]+("…" if len(text)>3000 else "")), "Azure Read – raw text")
            doc = _extract_from_read_text(text)

    if not doc.get("doc_type"):
        raise frappe.ValidationError("Could not determine document type")

    # Build target-field mapping based on doc type
    # Your fields:
    # id_expiry, id_number, license_expiry, license_number, date_of_birth,
    # passport_expiry, passport_number, attach_id, id_image,
    # national_id, attach_license, license_image, driving_license,
    # attach_passport, passport_image, customer_name
    to_set = {}
    dtype = doc["doc_type"]
    number = doc.get("generic_number")
    expiry = doc.get("generic_expiry")

    # Common fields (only if empty)
    if doc.get("customer_name"): to_set["customer_name"] = doc["customer_name"]
    if doc.get("date_of_birth"): to_set["date_of_birth"] = doc["date_of_birth"]

    if dtype == "passport":
        if number: to_set["passport_number"] = number
        if expiry: to_set["passport_expiry"] = expiry
        to_set["attach_passport"] = file_url
        to_set["passport_image"]  = file_url
    elif dtype == "driving_license":
        if number: to_set["license_number"] = number
        if expiry: to_set["license_expiry"] = expiry
        # Some customers want a text copy too
        to_set["driving_license"] = number or None
        to_set["attach_license"] = file_url
        to_set["license_image"]  = file_url
    elif dtype == "national_id":
        if number: to_set["id_number"] = number
        if expiry: to_set["id_expiry"] = expiry
        # Some customers want a text copy too
        to_set["national_id"] = number or None
        to_set["attach_id"] = file_url
        to_set["id_image"]  = file_url

    # Apply only where current value is empty
    cust = frappe.get_doc("Customer", customer)
    applied = {}
    for field, val in to_set.items():
        if not val:  # nothing to set
            continue
        # skip if field doesn't exist on Customer
        if not hasattr(cust, field) and field not in cust.as_dict():
            continue
        current = cust.get(field)
        if current in (None, "", []):
            applied[field] = val

    if applied:
        cust.update(applied)
        cust.save(ignore_permissions=False)
        frappe.db.commit()

    # Also keep an audit File attachment (optional, independent of image fields)
    try:
        f = frappe.new_doc("File")
        f.file_url = file_url
        f.attached_to_doctype = "Customer"
        f.attached_to_name = cust.name
        f.insert(ignore_permissions=True)
    except Exception as e:
        if int(debug): frappe.log_error(f"Attach failed: {e}", "apply_scan_to_customer")

    return {
        "doc_type": dtype,
        "applied_fields": list(applied.keys()),
        "skipped_existing": [k for k in to_set.keys() if k not in applied],
        "preview": applied
    }
