# File: your_app/your_app/vehicles/api.py
# Server-side VIN decoder with auto-create for Vehicles Model

import frappe
import requests
from frappe import _

@frappe.whitelist()
def decode_vehicle_vin(vin, model_year=None):
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
    
    # Clean VIN
    vin = vin.strip().upper()
    
    # Validate VIN length
    if len(vin) < 11:
        frappe.throw(_("VIN must be at least 11 characters long"))
    
    # Check for invalid characters in full VIN
    if len(vin) == 17:
        invalid_chars = set('IOQ')
        if any(char in invalid_chars for char in vin):
            frappe.throw(_("VIN cannot contain letters I, O, or Q"))
    
    try:
        # Build API URL
        api_url = f"https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValues/{vin}"
        params = {"format": "json"}
        
        if model_year:
            params["modelyear"] = model_year
        
        # Make API request
        response = requests.get(api_url, params=params, timeout=15)
        response.raise_for_status()
        
        data = response.json()
        
        if data.get("Results") and len(data["Results"]) > 0:
            result = data["Results"][0]
            
            # Check for errors
            error_code = result.get("ErrorCode", "")
            if "0" in error_code:
                # Map to your DocType fields
                mapped_data = map_to_vehicle_fields(result)
                
                # Create manufacturer and model if they don't exist
                make_name = create_manufacturer_if_not_exists(result)
                model_name = create_vehicle_model_if_not_exists(result, make_name)
                
                # Add the linked fields to mapped data
                if make_name:
                    mapped_data['custom_make'] = make_name
                    frappe.msgprint(_("Manufacturer set: {0}").format(make_name), indicator='blue', alert=True)
                    
                if model_name:
                    mapped_data['model'] = model_name
                    frappe.msgprint(_("Model set: {0}").format(model_name), indicator='blue', alert=True)
                
                return {
                    "success": True,
                    "data": mapped_data,
                    "raw_data": result,
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
            
    except requests.exceptions.Timeout:
        frappe.log_error("VIN Decode Timeout", "VIN Decoder")
        return {
            "success": False,
            "message": _("Request timed out. Please try again."),
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


def create_manufacturer_if_not_exists(api_data):
    """
    Create Manufacturers record if it doesn't exist
    
    Args:
        api_data (dict): API response data
    
    Returns:
        str: Manufacturer name
    """
    make = api_data.get("Make")
    if not make or make == "Not Applicable":
        return None
    
    # Clean the make name
    make = make.strip()
    
    # Check if manufacturer exists - use a more robust check
    existing_make = frappe.db.get_value("Manufacturers", 
        filters={"manufacturer_name": make}, 
        fieldname="name"
    )
    
    if existing_make:
        return existing_make
    
    try:
        # Double-check before creating (prevent race condition)
        existing_make = frappe.db.get_value("Manufacturers", 
            filters={"manufacturer_name": make}, 
            fieldname="name"
        )
        
        if existing_make:
            return existing_make
        
        # Create new manufacturer
        manufacturer_doc = frappe.get_doc({
            "doctype": "Manufacturers",
            "manufacturer_name": make,
            # Add any other required fields for your Manufacturers doctype
        })
        
        manufacturer_doc.insert(ignore_permissions=True, ignore_if_duplicate=True)
        frappe.db.commit()
        
        frappe.msgprint(_("Created new manufacturer: {0}").format(make), alert=True)
        
        # Return the name of the created document
        return manufacturer_doc.name
        
    except frappe.DuplicateEntryError:
        # Manufacturer was created by another process, fetch and return it
        frappe.db.rollback()
        existing_make = frappe.db.get_value("Manufacturers", 
            filters={"manufacturer_name": make}, 
            fieldname="name"
        )
        return existing_make
        
    except Exception as e:
        frappe.log_error(f"Error creating manufacturer {make}: {str(e)}", "VIN Decoder")
        frappe.db.rollback()
        # Try to return existing manufacturer if any
        existing_make = frappe.db.get_value("Manufacturers", 
            filters={"manufacturer_name": make}, 
            fieldname="name"
        )
        return existing_make if existing_make else None


def create_vehicle_model_if_not_exists(api_data, manufacturer_name):
    """
    Create Vehicles Model record if it doesn't exist
    
    Args:
        api_data (dict): API response data
        manufacturer_name (str): Manufacturer name from Manufacturers doctype
    
    Returns:
        str: Model name
    """
    model = api_data.get("Model")
    if not model or model == "Not Applicable":
        return None
    
    # Clean the model name
    model = model.strip()
    
    # Check if model exists - use a more robust check
    existing_model = frappe.db.get_value("Vehicles Model", 
        filters={"model_name": model}, 
        fieldname="name"
    )
    
    if existing_model:
        return existing_model
    
    try:
        # Get vehicle type from API
        vehicle_type = api_data.get("VehicleType")
        if vehicle_type and vehicle_type != "Not Applicable":
            vehicle_type = vehicle_type.strip()
        else:
            vehicle_type = None
        
        # Double-check before creating (prevent race condition)
        existing_model = frappe.db.get_value("Vehicles Model", 
            filters={"model_name": model}, 
            fieldname="name"
        )
        
        if existing_model:
            return existing_model
        
        # Create new vehicle model
        model_doc = frappe.get_doc({
            "doctype": "Vehicles Model",
            "model_name": model,
            "manufacturer": manufacturer_name,
            "vehicle_type": vehicle_type,
        })
        
        model_doc.insert(ignore_permissions=True, ignore_if_duplicate=True)
        frappe.db.commit()
        
        frappe.msgprint(_("Created new vehicle model: {0}").format(model), alert=True)
        
        # Return the name of the created document
        return model_doc.name
        
    except frappe.DuplicateEntryError:
        # Model was created by another process, fetch and return it
        frappe.db.rollback()
        existing_model = frappe.db.get_value("Vehicles Model", 
            filters={"model_name": model}, 
            fieldname="name"
        )
        return existing_model
        
    except Exception as e:
        frappe.log_error(f"Error creating vehicle model {model}: {str(e)}", "VIN Decoder")
        frappe.db.rollback()
        # Try to return existing model if any
        existing_model = frappe.db.get_value("Vehicles Model", 
            filters={"model_name": model}, 
            fieldname="name"
        )
        return existing_model if existing_model else None


def map_to_vehicle_fields(api_data):
    """Map API response to Vehicles DocType fields"""
    
    # Helper function to get value safely
    def get_value(key):
        val = api_data.get(key)
        if val and val not in ["Not Applicable", "null", ""]:
            return val
        return None
    
    # Map fuel type
    def map_fuel_type(api_fuel):
        if not api_fuel:
            return None
        
        fuel_map = {
            'Gasoline': 'Gasoline',
            'Diesel': 'Diesel',
            'LPG': 'LPG',
            'Liquefied Petroleum Gas': 'LPG',
            'Electric': 'Electric',
            'Plug-in Hybrid': 'Hybrid',
            'Hybrid': 'Hybrid',
            'E85': 'Gasoline',
            'Flex': 'Gasoline',
        }
        
        for key, value in fuel_map.items():
            if key.lower() in api_fuel.lower():
                return value
        return None
    
    # Map transmission
    def map_transmission(api_trans):
        if not api_trans:
            return None
        
        api_trans_lower = api_trans.lower()
        if 'manual' in api_trans_lower:
            return 'Manual'
        elif any(x in api_trans_lower for x in ['auto', 'cvt', 'dct']):
            return 'Automatic'
        return None
    
    # Calculate seats (approximate)
    def calculate_seats(doors, rows):
        if rows:
            try:
                return str(int(rows) * 2)
            except:
                pass
        
        if doors:
            return '2' if doors == '2' else '5'
        
        return None
    
    # Build mapped data
    mapped = {
        'model_year': get_value('ModelYear'),
        'custom_variant': get_value('Trim') or get_value('Series'),
        'custom_engine_number': get_value('EngineModel'),
        'custom_cylinders': get_value('EngineCylinders'),
        'horsepower': get_value('EngineHP') or get_value('EngineKW'),
        'power': get_value('DisplacementCC') or get_value('EngineKW'),
        'doors_number': get_value('Doors'),
        'seats_number': calculate_seats(get_value('Doors'), get_value('SeatingRows')),
        'fuel_type': map_fuel_type(get_value('FuelTypePrimary')),
        'transmission': map_transmission(get_value('TransmissionStyle')),
    }
    
    # Build description with all details
    description_parts = ["Vehicle Information (Auto-decoded from VIN):\n"]
    
    info_fields = {
        'Make': get_value('Make'),
        'Manufacturer': get_value('Manufacturer'),
        'Model': get_value('Model'),
        'Year': get_value('ModelYear'),
        'Body Class': get_value('BodyClass'),
        'Vehicle Type': get_value('VehicleType'),
        'Trim': get_value('Trim'),
        'Series': get_value('Series'),
        'Engine Model': get_value('EngineModel'),
        'Displacement': f"{get_value('DisplacementL')}L" if get_value('DisplacementL') else None,
        'Drive Type': get_value('DriveType'),
        'Brake System': get_value('BrakeSystemType'),
        'ABS': get_value('ABS'),
        'ESC': get_value('ESC'),
        'Traction Control': get_value('TractionControl'),
        'Airbags': get_value('AirBagLocFront'),
        'Plant Country': get_value('PlantCountry'),
        'Plant City': get_value('PlantCity'),
    }
    
    for label, value in info_fields.items():
        if value:
            description_parts.append(f"{label}: {value}")
    
    mapped['description'] = '\n'.join(description_parts)
    
    # Additional info for reference
    mapped['_additional_info'] = {
        'make': get_value('Make'),
        'manufacturer': get_value('Manufacturer'),
        'model': get_value('Model'),
        'body_class': get_value('BodyClass'),
        'vehicle_type': get_value('VehicleType'),
        'drive_type': get_value('DriveType'),
        'displacement_l': get_value('DisplacementL'),
        'displacement_cc': get_value('DisplacementCC'),
        'engine_config': get_value('EngineConfiguration'),
        'fuel_injection': get_value('FuelInjectionType'),
        'turbo': get_value('Turbo'),
        'top_speed_mph': get_value('TopSpeedMPH'),
        'gvwr': get_value('GVWR'),
        'plant_country': get_value('PlantCountry'),
    }
    
    # Remove None values
    mapped = {k: v for k, v in mapped.items() if v is not None}
    
    return mapped


@frappe.whitelist()
def auto_fill_vehicle(doc_name, vin, model_year=None):
    """
    Auto-fill Vehicle document from VIN
    
    Args:
        doc_name (str): Name of Vehicles document
        vin (str): VIN
        model_year (str, optional): Model year
    
    Returns:
        dict: Result
    """
    # Decode VIN
    result = decode_vehicle_vin(vin, model_year)
    
    if not result.get("success"):
        return result
    
    # Get document
    try:
        doc = frappe.get_doc("Vehicles", doc_name)
    except frappe.DoesNotExistError:
        return {
            "success": False,
            "message": _("Vehicle document not found")
        }
    
    # Update fields
    mapped_data = result.get("data", {})
    
    for field, value in mapped_data.items():
        if field.startswith('_'):  # Skip internal fields
            continue
        
        if hasattr(doc, field):
            setattr(doc, field, value)
    
    # Save
    doc.save()
    
    return {
        "success": True,
        "message": _("Vehicle updated successfully"),
        "data": mapped_data
    }


@frappe.whitelist()
def validate_vin(vin):
    """
    Validate VIN format
    
    Args:
        vin (str): VIN to validate
    
    Returns:
        dict: Validation result
    """
    if not vin:
        return {"valid": False, "message": "VIN is empty"}
    
    vin = vin.strip().upper()
    
    # Check length
    if len(vin) < 11:
        return {"valid": False, "message": "VIN must be at least 11 characters"}
    
    # Check for invalid characters in full VIN
    if len(vin) == 17:
        invalid_chars = set('IOQ')
        found_invalid = [c for c in vin if c in invalid_chars]
        if found_invalid:
            return {
                "valid": False,
                "message": f"VIN cannot contain letters: {', '.join(found_invalid)}"
            }
    
    return {"valid": True, "message": "VIN is valid"}
