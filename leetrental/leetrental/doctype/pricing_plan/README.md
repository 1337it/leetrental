# Pricing Plan DocType

## Overview
The Pricing Plan DocType manages rental pricing structures for different vehicle types in the LeetRental application.

## Features

### Fields
- **Plan Name**: Unique identifier for the pricing plan
- **Vehicle Type**: Category of vehicle (Sedan, SUV, Van, Luxury, Compact, Truck, Convertible)
- **Is Active**: Toggle to enable/disable the plan
- **Daily Rate**: Cost per day
- **Weekly Rate**: Cost per week (typically discounted)
- **Monthly Rate**: Cost per month (typically heavily discounted)
- **Mileage Included Per Day**: Free kilometers per rental day
- **Extra KM Rate**: Cost per kilometer over the included mileage

### Validations
1. **Rate Validation**: Ensures all rates are positive
2. **Discount Warnings**: Alerts if weekly/monthly rates don't offer expected discounts
3. **Mileage Logic**: Validates mileage-related field combinations

### Methods

#### `get_rate_for_duration(days)`
Calculates the most economical rate for a given rental duration.

**Parameters:**
- `days` (int): Number of rental days

**Returns:**
- Dictionary with rate type, total cost, and per-day cost

**Example:**