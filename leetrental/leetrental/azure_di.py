import os, re, json, time, requests
import frappe
from frappe.utils.file_manager import get_file_path

API_VERSION = "2024-11-30"
MODEL_READ  = "prebuilt-read"  # you proved this is working

def _cfg():
    sc = frappe.get_site_config()
    return sc.get("azure_di_endpoint"), sc.get("azure_di_key")

def _post_read_analyze(endpoint, key, *, url_source=None, file_bytes=None):
    """
    Calls prebuilt-read:analyze (analyzeDocument overload).
    Returns the Operation-Location for polling.
    """
    base = f"{endpoint}/documentintelligence/documentModels/{MODEL_READ}:analyze"
    params = {"api-version": API_VERSION, "_overload": "analyzeDocument"}
    headers = {"Ocp-Apim-Subscription-Key": key}

    if url_source:
        headers["Content-Type"] = "application/json"
        body = {"urlSource": url_source}
        r = requests.post(base, params=params, headers=headers, json=body, timeout=60)
    else:
        headers["Content-Type"] = "application/octet-stream"
        r = requests.post(base, params=params, headers=headers, data=file_bytes, timeout=60)

    r.raise_for_status()
    op_loc = r.headers.get("Operation-Location")
    if not op_loc:
        raise frappe.ValidationError("Azure did not return Operation-Location header.")
    return op_loc

def _poll_analyze_result(op_location, key, timeout_s=60):
    """
    Polls the Operation-Location until status is 'succeeded' or 'failed'.
    Returns the final JSON when done.
    """
    headers = {"Ocp-Apim-Subscription-Key": key}
    t0 = time.time()
    while True:
        rr = requests.get(op_location, headers=headers, timeout=60)
        rr.raise_for_status()
        jj = rr.json()
        st = jj.get("status")
        if st in ("succeeded", "failed"):
            return jj
        if time.time() - t0 > timeout_s:
            raise frappe.ValidationError("Azure analyze timed out.")
        time.sleep(1.0)

def _read_text_from_result(result_json):
    """
    Extracts plain text from prebuilt-read analyzeResult (words/lines/paragraphs).
    Returns a single text blob for regex parsing.
    """
    ar = result_json.get("analyzeResult") or {}
    # Prefer paragraphs; fallback to content if present
    paras = ar.get("paragraphs") or []
    if paras:
        parts = [p.get("content", "") for p in paras if p.get("content")]
        return "\n".join(parts).strip()
    # Older shapes might have 'content'
    content = ar.get("content")
    if isinstance(content, str) and content.strip():
        return content.strip()
    # Fallback: lines from pages
    pages = ar.get("pages") or []
    lines = []
    for pg in pages:
        for ln in pg.get("lines", []):
            txt = ln.get("content")
            if txt:
                lines.append(txt)
    return "\n".join(lines).strip()

# --- Very light heuristics for IDs/Passports/DL (tune as needed) ---
DATE_RX = r"(\d{4}[/-]\d{1,2}[/-]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4})"

def _norm_date(s):
    if not s: return None
    s = s.replace(".", "/").replace("-", "/")
    parts = s.split("/")
    # Try sensible normalizations
    if len(parts) == 3:
        a,b,c = parts
        a,b,c = a.zfill(2), b.zfill(2), c.zfill(4)
        # Heuristic: if first part is 4-digit assume YYYY/MM/DD
        if len(a) == 4:
            return f"{a}-{b}-{c}"
        # Otherwise assume DD/MM/YYYY
        return f"{c}-{b}-{a}"
    return None

def _extract_fields_from_text(text):
    """
    Parse generic fields from the raw text (works across many IDs with English labels).
    Add/adjust patterns for your specific IDs (Emirates ID, UAE DL, etc.).
    """
    out = {}

    # Names (prefer 'Full Name', else Name, else split on spaces)
    m = re.search(r"(Full\s*Name|Name)\s*[:\-]\s*([A-Za-z' ]{3,})", text, re.I)
    if m:
        out["full_name"] = m.group(2).strip()
    else:
        # Fallback: pick a prominent uppercase line with >1 token
        lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
        cand = [ln for ln in lines if ln.replace(" ", "").isalpha() and len(ln.split())>=2 and ln.isupper()]
        if cand:
            out["full_name"] = cand[0].title()

    # First/Last from Full Name
    if out.get("full_name"):
        parts = out["full_name"].split()
        out["first_name"] = parts[0]
        if len(parts) > 1:
            out["last_name"] = parts[-1]

    # Document number (Passport/ID/DL)
    m = re.search(r"(Passport|Document|ID|Card|License)\s*(No\.?|Number)\s*[:\-]?\s*([A-Z0-9\-]+)", text, re.I)
    if not m:
        m = re.search(r"\b([A-Z]\d{6,9})\b", text)  # crude passport-like
    if m:
        out["passport_number"] = (m.group(3) if m.lastindex and m.lastindex >= 3 else m.group(1)).strip()

    # DOB
    m = re.search(r"(DOB|Date\s*of\s*Birth)\s*[:\-]?\s*"+DATE_RX, text, re.I)
    if m:
        out["date_of_birth"] = _norm_date(m.group(2) if m.lastindex>=2 else m.group(1))

    # Expiry
    m = re.search(r"(Expiry|Expiration|Exp\. Date|Valid\s*Until)\s*[:\-]?\s*"+DATE_RX, text, re.I)
    if m:
        out["passport_expiry"] = _norm_date(m.group(2) if m.lastindex>=2 else m.group(1))

    # Nationality
    m = re.search(r"(Nationality)\s*[:\-]\s*([A-Za-z ]+)", text, re.I)
    if m:
        out["nationality"] = m.group(2).strip()

    # Gender / Sex
    m = re.search(r"(Gender|Sex)\s*[:\-]\s*(Male|Female|M|F)\b", text, re.I)
    if m:
        g = m.group(2).upper()
        out["gender"] = "Male" if g in ("M","MALE") else "Female"

    # Issuer
    m = re.search(r"(Issuing\s*(Country|Authority)|Issuer)\s*[:\-]\s*([A-Za-z ]+)", text, re.I)
    if m:
        out["passport_issuer"] = m.group(3).strip()

    # Heuristic mapping to DL/ID if labels present
    if re.search(r"License", text, re.I):
        if out.get("passport_number"):
            out["driver_license_number"] = out["passport_number"]
        if out.get("passport_expiry"):
            out["license_expiry"] = out["passport_expiry"]
    if re.search(r"\bID\b|\bEmirates\b", text, re.I):
        if out.get("passport_number"):
            out["national_id_number"] = out["passport_number"]
        if out.get("passport_expiry"):
            out["id_expiry"] = out["passport_expiry"]

    return {k:v for k,v in out.items() if v}

@frappe.whitelist()
def extract_and_update_customer_via_read(customer: str, file_url: str, use_urlsource: int = 0, rename_customer: int = 0, debug: int = 0):
    """
    Uses Azure Document Intelligence prebuilt-read to extract plain text,
    regex-parse key fields, and update the Customer.
    - If `use_urlsource` is 1 and file_url is public, sends urlSource.
    - Otherwise streams binary bytes from the Frappe file store.
    """
    frappe.only_for(("System Manager","Sales Manager","Sales User","Administrator"))

    endpoint, key = _cfg()
    if not (endpoint and key):
        raise frappe.ValidationError("Azure endpoint/key missing in site_config.json")

    # Prepare request
    url_source = None
    file_bytes = None
    if int(use_urlsource) and file_url.lower().startswith(("http://","https://")):
        url_source = file_url
    else:
        # Load bytes from private file store
        path = get_file_path(file_url)
        if not os.path.exists(path):
            raise frappe.ValidationError(f"File not found: {path}")
        with open(path, "rb") as f:
            file_bytes = f.read()

    # 1) Submit analyze
    op_loc = _post_read_analyze(endpoint, key, url_source=url_source, file_bytes=file_bytes)

    # 2) Poll for result
    result = _poll_analyze_result(op_loc, key, timeout_s=90)

    if result.get("status") != "succeeded":
        if int(debug):
            frappe.log_error(json.dumps(result, ensure_ascii=False, indent=2), "Azure Read – failed")
        raise frappe.ValidationError("Azure analysis failed")

    # 3) Extract text → regex mapping
    text = _read_text_from_result(result)
    if int(debug):
        frappe.log_error((text[:3000] + ("…" if len(text) > 3000 else "")), "Azure Read – raw text")

    mapped = _extract_fields_from_text(text)

    # Derive customer_name if missing
    if mapped.get("full_name") and not mapped.get("customer_name"):
        mapped["customer_name"] = mapped["full_name"]

     if file_url:
        mapped["passport_image"] = file_url

    # Clean empties
    mapped = {k:v for k,v in mapped.items() if v not in ("", None)}

    # 4) Save to Customer
    before = frappe.get_doc("Customer", customer).as_dict()
    applied = [k for k,v in mapped.items() if before.get(k) != v]
    if mapped:
        frappe.db.set_value("Customer", customer, mapped)
        frappe.db.commit()

    # 5) Optional rename
    if int(rename_customer) and mapped.get("customer_name") and mapped["customer_name"] != customer:
        try:
            frappe.rename_doc("Customer", customer, mapped["customer_name"], force=True)
            customer = mapped["customer_name"]
        except Exception as e:
            frappe.log_error(f"Customer rename failed: {e}", "Azure Read OCR")

    return {
        "count": len(applied),
        "applied_fields": applied,
        "preview": {k: mapped[k] for k in applied},
        "op_location": op_loc
    }
