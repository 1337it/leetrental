# leet_integrations/leet_integrations/azure_di.py
import os, re, json, time, requests
import frappe
from frappe.utils.file_manager import get_file_path

API_VERSION = "2024-11-30"
MODEL_READ  = "prebuilt-read"

def _cfg():
    sc = frappe.get_site_config()
    return sc.get("azure_di_endpoint"), sc.get("azure_di_key")

def _post_read_analyze(endpoint, key, *, url_source=None, file_bytes=None):
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

def _poll(op_location, key, timeout_s=90):
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

def _read_text(result_json):
    ar = result_json.get("analyzeResult") or {}
    paras = ar.get("paragraphs") or []
    if paras:
        return "\n".join([p.get("content","") for p in paras if p.get("content")]).strip()
    content = ar.get("content")
    if isinstance(content, str) and content.strip():
        return content.strip()
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

def _extract_fields(text):
    out={}
    m=re.search(r"(Full\s*Name|Name)\s*[:\-]\s*([A-Za-z' ]{3,})", text, re.I)
    if m: out["full_name"]=m.group(2).strip()
    else:
        lines=[ln.strip() for ln in text.splitlines() if ln.strip()]
        cand=[ln for ln in lines if ln.replace(" ","").isalpha() and len(ln.split())>=2 and ln.isupper()]
        if cand: out["full_name"]=cand[0].title()
    if out.get("full_name"):
        parts=out["full_name"].split()
        out["first_name"]=parts[0]
        if len(parts)>1: out["last_name"]=parts[-1]

    m=re.search(r"(Passport|Document|ID|Card|License)\s*(No\.?|Number)\s*[:\-]?\s*([A-Z0-9\-]+)", text, re.I)
    if not m: m=re.search(r"\b([A-Z]\d{6,9})\b", text)
    if m: out["passport_number"]=(m.group(3) if m.lastindex and m.lastindex>=3 else m.group(1)).strip()

    m=re.search(r"(DOB|Date\s*of\s*Birth)\s*[:\-]?\s*"+DATE_RX, text, re.I)
    if m: out["date_of_birth"]=_norm_date(m.group(2) if m.lastindex>=2 else m.group(1))

    m=re.search(r"(Expiry|Expiration|Exp\. Date|Valid\s*Until)\s*[:\-]?\s*"+DATE_RX, text, re.I)
    if m: out["passport_expiry"]=_norm_date(m.group(2) if m.lastindex>=2 else m.group(1))

    m=re.search(r"(Nationality)\s*[:\-]\s*([A-Za-z ]+)", text, re.I)
    if m: out["nationality"]=m.group(2).strip()

    m=re.search(r"(Gender|Sex)\s*[:\-]\s*(Male|Female|M|F)\b", text, re.I)
    if m:
        g=m.group(2).upper()
        out["gender"]="Male" if g in ("M","MALE") else "Female"

    m=re.search(r"(Issuing\s*(Country|Authority)|Issuer)\s*[:\-]\s*([A-Za-z ]+)", text, re.I)
    if m: out["passport_issuer"]=m.group(3).strip()

    return {k:v for k,v in out.items() if v}

def _sanitize_docname(name: str) -> str:
    # remove characters Frappe doesn't like in names
    nm = re.sub(r"[^\w\s.-]", "", name).strip()
    nm = re.sub(r"\s+", " ", nm)
    return nm

def _ensure_passport_image_field():
    # avoid crashes if field not added yet
    return frappe.db.has_column("Customer", "passport_image")

@frappe.whitelist()
def create_customer_from_scan(file_url: str, use_urlsource: int = 0, set_docname_to_name: int = 0, debug: int = 0):
    """
    1) Sends the image/PDF to Azure prebuilt-read
    2) Extracts key fields from text
    3) Creates a new Customer with extracted name and details
    4) Saves the image into Customer.passport_image and attaches the file
    Params:
      - file_url: Frappe file URL or public URL
      - use_urlsource: 1 to let Azure fetch via URL if public
      - set_docname_to_name: 1 to rename the Customer docname to extracted full name
    """
    frappe.only_for(("System Manager","Sales Manager","Sales User","Administrator"))

    endpoint, key = _cfg()
    if not (endpoint and key):
        raise frappe.ValidationError("Azure endpoint/key missing in site_config.json")

    # Prepare bytes or urlSource
    url_source=None; file_bytes=None
    if int(use_urlsource) and file_url.lower().startswith(("http://","https://")):
        url_source=file_url
    else:
        path=get_file_path(file_url)
        if not os.path.exists(path):
            raise frappe.ValidationError(f"File not found: {path}")
        with open(path,"rb") as f: file_bytes=f.read()

    # Analyze
    op_loc=_post_read_analyze(endpoint, key, url_source=url_source, file_bytes=file_bytes)
    result=_poll(op_loc, key, timeout_s=90)
    if result.get("status")!="succeeded":
        if int(debug): frappe.log_error(json.dumps(result, ensure_ascii=False, indent=2),"Azure Read – failed")
        raise frappe.ValidationError("Azure analysis failed")

    text=_read_text(result)
    if int(debug):
        frappe.log_error((text[:3000]+("…" if len(text)>3000 else "")), "Azure Read – raw text")

    fields=_extract_fields(text)

    # Build new Customer doc
    full_name = fields.get("full_name") or "New Customer"
    cust = frappe.new_doc("Customer")
    cust.customer_type = "Individual"
    cust.customer_name = full_name
    # (Let naming series assign docname; we can rename later if requested.)

    # Map common fields
    for k in ("first_name","last_name","date_of_birth","gender","nationality",
              "passport_number","passport_expiry","passport_issuer"):
        if fields.get(k): cust.set(k, fields[k])

    # Store image into Attach Image field (if exists)
    if _ensure_passport_image_field():
        cust.attach_passport = file_url

    cust.insert(ignore_permissions=False)
    created_name = cust.name

    # Attach original file (for audit)
    try:
        f = frappe.new_doc("File")
        f.file_url = file_url
        f.attached_to_doctype = "Customer"
        f.attached_to_name = created_name
        f.insert(ignore_permissions=True)
    except Exception as e:
        frappe.log_error(f"Attach failed: {e}", "Scan Create Customer")

    # Optional: rename docname to extracted name
    if int(set_docname_to_name) and full_name and full_name != created_name:
        new_name = _sanitize_docname(full_name)
        # Avoid collisions
        if not frappe.db.exists("Customer", new_name):
            try:
                frappe.rename_doc("Customer", created_name, new_name, force=True)
                created_name = new_name
            except Exception as e:
                frappe.log_error(f"Rename failed: {e}", "Scan Create Customer")

    return {
        "created": True,
        "name": created_name,
        "customer_name": full_name,
        "applied_fields": [k for k in fields.keys()],
        "op_location": op_loc
    }
