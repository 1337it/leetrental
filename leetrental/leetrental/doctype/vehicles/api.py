# File: your_app/your_app/vehicles/api.py
# Server-side API for VIN decoding

import frappe
import requests
from frappe import _

@frappe.whitelist()
def decode_vin(vin, model_year=None):
    """
    Decode VIN using NHTSA vPIC API
    
    Args:
        vin (str): Vehicle Identification Number
        model_year (str, optional): Model year for better accuracy
    
    Returns:
        dict: Decoded vehicle information
    """
    if not vin:
        frappe.throw(_("VIN is required"))
    
    # Validate VIN length
    if len(vin) < 11:
        frappe.throw(_("VIN must be at least 11 characters long"))
    
    try:
        # Build API URL
        api_url = f"https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{vin}"
        params = {"format": "json"}
        
        if model_year:
            params["modelyear"] = model_year
        
        # Make API request
        response = requests.get(api_url, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        if data.get("Results") and len(data["Results"]) > 0:
            result = data["Results"][0]
            
            # Check for errors
            if result.get("ErrorCode") and "0" in result.get("ErrorCode", ""):
                return {
                    "success": True,
                    "data": result,
                    "message": _("VIN decoded successfully")
                }
            else:
                return {
                    "success": False,
                    "message": result.get("ErrorText", _("Unable to decode VIN")),
                    "data": None
                }
        else:
            return {
                "success": False,
                "message": _("No data returned from API"),
                "data": None
            }
            
    except requests.exceptions.RequestException as e:
        frappe.log_error(f"VIN Decode Error: {str(e)}", "VIN Decoder")
        return {
            "success": False,
            "message": _("Failed to connect to VIN decoder service"),
            "error": str(e)
        }
    except Exception as e:
        frappe.log_error(f"VIN Decode Error: {str(e)}", "VIN Decoder")
        return {
            "success": False,
            "message": _("An error occurred while decoding VIN"),
            "error": str(e)
        }


@frappe.whitelist()
def get_vehicle_makes():
    """
    Get all vehicle makes from NHTSA API
    
    Returns:
        list: List of vehicle makes
    """
    try:
        api_url = "https://vpic.nhtsa.dot.gov/api/vehicles/GetAllMakes"
        params = {"format": "json"}
        
        response = requests.get(api_url, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        if data.get("Results"):
            makes = [item["Make_Name"] for item in data["Results"]]
            return {"success": True, "makes": makes}
        else:
            return {"success": False, "message": _("No makes found")}
            
    except Exception as e:
        frappe.log_error(f"Get Makes Error: {str(e)}", "VIN Decoder")
        return {
            "success": False,
            "message": _("Failed to fetch vehicle makes"),
            "error": str(e)
        }


@frappe.whitelist()
def get_models_for_make(make, year=None):
    """
    Get models for a specific make and year
    
    Args:
        make (str): Vehicle make
        year (str, optional): Model year
    
    Returns:
        list: List of models
    """
    try:
        api_url = f"https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMake/{make}"
        params = {"format": "json"}
        
        response = requests.get(api_url, params=params, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        
        if data.get("Results"):
            models = [item["Model_Name"] for item in data["Results"]]
            return {"success": True, "models": models}
        else:
            return {"success": False, "message": _("No models found")}
            
    except Exception as e:
        frappe.log_error(f"Get Models Error: {str(e)}", "VIN Decoder")
        return {
            "success": False,
            "message": _("Failed to fetch models"),
            "error": str(e)
        }


@frappe.whitelist()
def auto_fill_vehicle_from_vin(doc_name, vin, model_year=None):
    """
    Auto-fill vehicle document fields from VIN
    
    Args:
        doc_name (str): Name of the Vehicles document
        vin (str): Vehicle Identification Number
        model_year (str, optional): Model year
    
    Returns:
        dict: Updated document
    """
    # Decode VIN
    result = decode_vin(vin, model_year)
    
    if not result.get("success"):
        frappe.throw(result.get("message", _("Failed to decode VIN")))
    
    # Get the document
    doc = frappe.get_doc("Vehicles", doc_name)
    
    # Map API data to document fields
    api_data = result.get("data", {})
    
    # Field mapping - customize based on your doctype
    field_map = {
        "make": "Make",
        "model": "Model",
        "model_year": "ModelYear",
        "manufacturer_name": "Manufacturer",
        "vehicle_type": "VehicleType",
        "body_class": "BodyClass",
        "trim": "Trim",
        "series": "Series",
        "engine_number_of_cylinders": "EngineCylinders",
        "displacement_cc": "DisplacementCC",
        "displacement_l": "DisplacementL",
        "engine_model": "EngineModel",
        "fuel_type_primary": "FuelTypePrimary",
        "transmission_style": "TransmissionStyle",
        "doors": "Doors",
        "drive_type": "DriveType",
        "abs": "ABS",
        "plant_country": "PlantCountry",
    }
    
    # Update fields
    for doc_field, api_field in field_map.items():
        value = api_data.get(api_field)
        if value and value not in ["Not Applicable", "", None]:
            if hasattr(doc, doc_field):
                setattr(doc, doc_field, value)
    
    # Save the document
    doc.save()
    
    return {
        "success": True,
        "message": _("Vehicle information updated successfully"),
        "doc": doc
    }
