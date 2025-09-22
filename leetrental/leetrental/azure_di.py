import os, re, json, time, requests
import frappe
from frappe.utils.file_manager import get_file_path

API_VERSION = "2024-11-30"
MODEL_ID    = "prebuilt-idDocument"
MODEL_READ  = "prebuilt-idDocument"

def _cfg():
    sc = frappe.get_site_config()
    return sc.get("azure_di_endpoint"), sc.get("azure_di_key")

def _post_analyze(endpoint, key, model, *, url_source=None, file_bytes=None, overload=None):
    base = f"{endpoint}/documentintelligence/documentModels/{model}:analyze"
    params = {"api-version": API_VERSION}
    if overload:
        params["_overload"] = overload
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
        raise frappe.ValidationError("Azure did not return Operation-Location")
    return op_loc

def _poll(op_location, key, timeout_s=90):
    headers = {"Ocp-Apim-Subscription-Key": key}
    t0 = time.time()
    while True:
        rr = requests.get(op_location, headers=headers, timeout=60)
        rr.raise_for_status()
        j = rr.json()
        st = j.get("status")
        if st in ("succeeded","failed"):
            return j
        if time.time() - t0 > timeout_s:
            raise frappe.ValidationError("Azure analyze timed out")
        time.sleep(1)

def _read_text(res):
    ar = (res.get("analyzeResult") or {})
    paras = ar.get("paragraphs") or []
    if paras:
        return "\n".join([p.get("content","") for p in paras if p.get("content")]).strip()
    if isinstance(ar.get("content"), str) and ar["content"].strip():
        return ar["content"].strip()
    lines=[]
    for pg in ar.get("pages") or []:
        for ln in pg.get("lines", []):
            if ln.get("content"): lines.append(ln["content"])
    return "\n".join(lines).strip()

def _norm_date(s):
    if not s: return None
    s = s.replace(".", "/").replace("-", "/")
    parts = s.split("/")
    if len(parts) == 3:
        a,b,c = parts
        a,b,c = a.zfill(4 if len(a)==4 else 2), b.zfill(2), c.zfill(4)
        if len(a)==4:  # YYYY/MM/DD
            return f"{a}-{b}-{c}"
        return f"{c}-{b}-{a}"  # DD/MM/YYYY -> YYYY-MM-DD
    return None

def _map_prebuilt_id(res):
    """
    Map Azure prebuilt-id result to YOUR fields + doc_type.
    All dates -> dd-mm-yyyy for Frappe.
    """
    out = {k: None for k in [
        "id_expiry","id_number","license_expiry","license_number","date_of_birth",
        "passport_expiry","passport_number","national_id","driving_license",
        "customer_name"
    ]}
    out["doc_type"] = None

    docs = (res.get("analyzeResult") or {}).get("documents") or []
    if not docs:
        return out
    d = docs[0]
    fields = d.get("fields", {}) or {}

    def v(*keys):
        for k in keys:
            node = fields.get(k) or {}
            val = node.get("valueString") or node.get("content") or node.get("valueDate")
            if val: return str(val).strip()
        return None

    # docType e.g. idDocument.passport/driverLicense/nationalIdentityCard
    dt = (d.get("docType") or "").lower()
    if "passport" in dt: out["doc_type"] = "passport"
    elif "driver" in dt: out["doc_type"] = "driving_license"
    elif "identity" in dt or "idcard" in dt: out["doc_type"] = "national_id"

    # Names
    full  = v("FullName","Name")
    first = v("FirstName","GivenName","GivenNames","Forename")
    last  = v("LastName","Surname","FamilyName")
    out["customer_name"] = full or (f"{first or ''} {last or ''}".strip() or None)

    # DOB (normalize)
    dob_raw = v("DateOfBirth","BirthDate","DOB")
    out["date_of_birth"] = _norm_date(dob_raw)

    # Number / Expiry generic
    num = v("DocumentNumber","IDNumber","LicenseNumber","PersonalNumber","CardNumber","Number")
    exp_raw = v("DateOfExpiration","ExpirationDate","ExpiryDate","ValidUntil","ValidTo")
    exp = _norm_date(exp_raw)

    if out["doc_type"] == "passport":
        out["passport_number"] = num
        out["passport_expiry"] = exp
    elif out["doc_type"] == "driving_license":
        out["license_number"] = num
        out["license_expiry"] = exp
        out["driving_license"] = num
    elif out["doc_type"] == "national_id":
        out["id_number"] = num
        out["id_expiry"] = exp
        out["national_id"] = num

    return out

def _map_read_text(text):
    """
    Fallback regex mapping to YOUR fields + doc_type.
    All dates -> dd-mm-yyyy for Frappe.
    """
    out = {k: None for k in [
        "id_expiry","id_number","license_expiry","license_number","date_of_birth",
        "passport_expiry","passport_number","national_id","driving_license",
        "customer_name"
    ]}
    # Doc type hints
    dtype = "passport"
    if re.search(r"License", text, re.I): dtype = "driving_license"
    if re.search(r"\bID\b|\bEmirates\b|\bNational\b", text, re.I): dtype = "national_id"
    out["doc_type"] = dtype

    # Name
    m = re.search(r"(Full\s*Name|Name)\s*[:\-]\s*([A-Za-z' ]{3,})", text, re.I)
    if m:
        out["customer_name"] = m.group(2).strip()
    else:
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        cand = [ln for ln in lines if ln.replace(" ","").isalpha() and len(ln.split())>=2 and ln.isupper()]
        if cand: out["customer_name"] = cand[0].title()

    # DOB -> dd-mm-yyyy
    DATE_RX = r"(\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}[./-]\d{1,2}[./-]\d{2,4})"
    m = re.search(r"(DOB|Date\s*of\s*Birth)\s*[:\-]?\s*"+DATE_RX, text, re.I)
    if m:
        out["date_of_birth"] = _norm_date(m.group(2) if m.lastindex>=2 else m.group(1))

    # Number + Expiry (generic)
    mnum = re.search(r"(Passport|Document|ID|Card|License)\s*(No\.?|Number)\s*[:\-]?\s*([A-Z0-9\-]+)", text, re.I)
    if not mnum:
        mnum = re.search(r"\b([A-Z]\d{6,9})\b", text)
    generic_num = (mnum.group(3) if (mnum and mnum.lastindex and mnum.lastindex>=3) else (mnum.group(1) if mnum else None))

    mexp = re.search(r"(Expiry|Expiration|Exp\. Date|Valid\s*Until)\s*[:\-]?\s*"+DATE_RX, text, re.I)
    generic_exp = _norm_date(mexp.group(2) if (mexp and mexp.lastindex>=2) else (mexp.group(1) if mexp else None))

    if dtype == "passport":
        out["passport_number"] = generic_num
        out["passport_expiry"] = generic_exp
    elif dtype == "driving_license":
        out["license_number"] = generic_num
        out["license_expiry"] = generic_exp
        out["driving_license"] = generic_num
    elif dtype == "national_id":
        out["id_number"] = generic_num
        out["id_expiry"] = generic_exp
        out["national_id"] = generic_num

    return out

def _norm_date(s):
    """Return YYYY-MM-DD from inputs like YYYY/MM/DD, DD-MM-YYYY, etc."""
    if not s: return None
    s = s.replace(".", "/").replace("-", "/")
    parts = s.split("/")
    if len(parts) != 3: return None

    a, b, c = parts
    if len(a) == 4:   # YYYY/MM/DD
        yyyy, mm, dd = a, b.zfill(2), c.zfill(2)
    elif len(c) == 4: # DD/MM/YYYY
        yyyy, mm, dd = c, b.zfill(2), a.zfill(2)
    else:
        return None
    return f"{yyyy}-{mm}-{dd}"

@frappe.whitelist()
def create_customer_from_scan(file_url: str, use_urlsource: int = 0, set_docname_to_name: int = 1, debug: int = 0):
    """TEMP STUB just to verify routing. Replace with your real implementation after test."""
    # Create a minimal Customer so we prove the dotted path works
    doc = frappe.get_doc({
        "doctype": "Customer",
        "customer_type": "Individual",
        "customer_name": "Scanned Customer (stub)"
    }).insert()
    return {"name": doc.name}

@frappe.whitelist()
def analyze_scan(file_url: str, use_urlsource: int = 0, debug: int = 0):
    """
    NEW-FORM helper: analyze the scan and RETURN values mapped to your fields
    (no DB writes). The client script will set them on the unsaved form.
    """
    frappe.only_for(("System Manager","Sales Manager","Sales User","Administrator"))
    endpoint, key = _cfg()
    if not (endpoint and key):
        raise frappe.ValidationError("Azure endpoint/key missing in site_config.json")

    # prepare input
    url_source = None; file_bytes = None
    if int(use_urlsource) and file_url.lower().startswith(("http://","https://")):
        url_source = file_url
    else:
        path = get_file_path(file_url)
        if not os.path.exists(path):
            raise frappe.ValidationError(f"File not found: {path}")
        with open(path, "rb") as f:
            file_bytes = f.read()

    # try prebuilt-id first
    try:
        op = _post_analyze(endpoint, key, MODEL_ID, url_source=url_source, file_bytes=file_bytes)
        res = _poll(op, key)
        if res.get("status") == "succeeded":
            mapped = _map_prebuilt_id(res)
        else:
            mapped = {}
    except Exception as e:
        mapped = {}
        if int(debug): frappe.log_error(f"prebuilt-id failed: {e}", "Azure ID")

    # fallback to prebuilt-read
    if not mapped.get("customer_name") and not any(mapped.get(k) for k in ("passport_number","license_number","id_number")):
        op = _post_analyze(endpoint, key, MODEL_READ, url_source=url_source, file_bytes=file_bytes, overload="analyzeDocument")
        res = _poll(op, key)
        if res.get("status") != "succeeded":
            raise frappe.ValidationError("Azure reading failed")
        text = _read_text(res)
        if int(debug):
            frappe.log_error((text[:3000] + ("…" if len(text) > 3000 else "")), "Azure Read – raw text")
        mapped = _map_read_text(text)

    # attach/image fields for the detected doc type (client will set if exists)
    mapped["doc_type"] = mapped.get("doc_type") or "passport"
    if mapped["doc_type"] == "passport":
        mapped["attach_passport"] = file_url
        mapped["passport_image"] = file_url
    elif mapped["doc_type"] == "driving_license":
        mapped["attach_license"] = file_url
        mapped["license_image"] = file_url
    elif mapped["doc_type"] == "national_id":
        mapped["attach_id"] = file_url
        mapped["id_image"] = file_url

    # ensure only your fields are returned
    allowed = {
        "id_expiry","id_number","license_expiry","license_number","date_of_birth",
        "passport_expiry","passport_number","attach_id","id_image","national_id",
        "attach_license","license_image","driving_license","attach_passport",
        "passport_image","customer_name","doc_type"
    }
    filtered = {k: v for k, v in mapped.items() if k in allowed and v}

    if int(debug):
        frappe.log_error(json.dumps({"doc_type": mapped.get("doc_type"), "returned": filtered}, indent=2), "Analyze Scan – mapped")

    return {"fields": filtered, "doc_type": mapped.get("doc_type")}
