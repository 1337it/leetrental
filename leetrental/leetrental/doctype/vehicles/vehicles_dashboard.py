from __future__ import unicode_literals
from frappe import _

# Copyright (c) 2022, Solufy and contributors
# For license information, please see license.txt


def get_data():
	return {
		"heatmap": True,
		"heatmap_message": _(
			"This is based on transactions against this vehicles. See timeline below for details"
		),
		"fieldname": "vehicle",
		"non_standard_fieldnames": {"Customer": "customer"},
		"transactions": [{"items": ["Services"]}, {"items": ["Odometers"]},{"items": ["leetrental"]},{"items": ["Contract Information"]},{"items": ["Driver History"]}],
	}
