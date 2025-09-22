# --- ADD in azure_di.py ---
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
        jj = rr.json()
        st = jj.get("status")
        if st in ("succeeded","failed"):
            return jj
        if time.time() - t0 > timeout_s:
            raise frappe.ValidationError("Azure analyze timed out")
        time.sleep(1)

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

@frappe.whitelist()
def analyze_scan(file_url: str, use_urlsource: int = 0, debug: int = 0):
    """
    Form-view helper: analyze a scan and RETURN parsed fields ONLY.
    Caller (client script) will set values on the unsaved Customer form.
    """
    frappe.only_for(("System Manager","Sales Manager","Sales User","Administrator"))
    endpoint, key = _cfg()
    if not (endpoint and key):
        raise frappe.ValidationError("Azure endpoint/key missing in site_config.json")

    url_source=None; file_bytes=None
    if int(use_urlsource) and file_url.lower().startswith(("http://","https://")):
        url_source=file_url
    else:
        path=get_file_path(file_url)
        if not os.path.exists(path):
            raise frappe.ValidationError(f"File not found: {path}")
        with open(path,"rb") as f: file_bytes=f.read()

    op_loc=_post_read_analyze(endpoint, key, url_source=url_source, file_bytes=file_bytes)
    result=_poll(op_loc, key, timeout_s=90)
    if result.get("status")!="succeeded":
        if int(debug): frappe.log_error(json.dumps(result, ensure_ascii=False, indent=2), "Azure Read – failed")
        raise frappe.ValidationError("Azure analysis failed")

    text=_read_text(result)
    if int(debug):
        frappe.log_error((text[:3000]+("…" if len(text)>3000 else "")), "Azure Read – raw text")

    fields=_extract_fields(text)
    # echo back the uploaded file URL so client can set Attach Image field
    fields["passport_image"] = file_url
    # prefer using full_name for the visible title
    if fields.get("full_name") and not fields.get("customer_name"):
        fields["customer_name"] = fields["full_name"]

    return {"fields": fields, "op_location": op_loc}
