# Copyright (c) 2024, Frappe Technologies and contributors
# For license information, please see license.txt

import frappe
from frappe.model.document import Document
from frappe import _
from frappe.utils import now_datetime, get_datetime

class VehicleMovements(Document):
	def validate(self):
		self.validate_workshop_fields()
		self.auto_populate_workshop_location()
		
	def on_submit(self):
		if self.movement_type == "Workshop":
			self.update_vehicle_status()
			self.send_workshop_notifications()
			self.create_workshop_log()
	
	def on_cancel(self):
		if self.movement_type == "Workshop":
			self.revert_vehicle_status()
	
	def validate_workshop_fields(self):
		"""Validate mandatory fields when Workshop is selected"""
		if self.movement_type == "Workshop":
			settings = frappe.get_single("Workshop Settings")
			
			# Check if odometer reading is required
			if settings.require_odometer_reading and not self.odometer_reading:
				frappe.throw(_("Odometer Reading is mandatory for Workshop movements"))
			
			# Check if estimated completion date is required
			if settings.require_estimated_completion_date and not self.estimated_completion_date:
				frappe.throw(_("Estimated Completion Date is mandatory for Workshop movements"))
			
			# Validate workshop reason
			if not self.workshop_reason:
				frappe.throw(_("Workshop Reason is mandatory for Workshop movements"))
			
			# Validate purpose
			if not self.purpose:
				frappe.throw(_("Purpose is mandatory for Workshop movements"))
			
			# Validate estimated completion date is in future
			if self.estimated_completion_date:
				if get_datetime(self.estimated_completion_date) < get_datetime(self.movement_date):
					frappe.throw(_("Estimated Completion Date cannot be before Movement Date"))
	
	def auto_populate_workshop_location(self):
		"""Auto-populate workshop location from settings"""
		if self.movement_type == "Workshop" and not self.to_location:
			settings = frappe.get_single("Workshop Settings")
			if settings.default_workshop_location:
				self.to_location = settings.default_workshop_location
	
	def update_vehicle_status(self):
		"""Update vehicle status to In Workshop"""
		settings = frappe.get_single("Workshop Settings")
		
		if settings.auto_update_vehicle_status:
			vehicle = frappe.get_doc("Vehicle", self.vehicle)
			vehicle.db_set("status", "In Workshop", update_modified=False)
			
			# Add a comment to vehicle
			vehicle.add_comment(
				"Info",
				_("Vehicle moved to workshop on {0}. Reason: {1}").format(
					self.movement_date,
					self.workshop_reason or "Not specified"
				)
			)
	
	def revert_vehicle_status(self):
		"""Revert vehicle status when movement is cancelled"""
		settings = frappe.get_single("Workshop Settings")
		
		if settings.auto_update_vehicle_status:
			vehicle = frappe.get_doc("Vehicle", self.vehicle)
			vehicle.db_set("status", "Available", update_modified=False)
			
			vehicle.add_comment(
				"Info",
				_("Workshop movement cancelled on {0}").format(now_datetime())
			)
	
	def send_workshop_notifications(self):
		"""Send notifications to maintenance team"""
		settings = frappe.get_single("Workshop Settings")
		
		# Send email notifications
		if settings.send_email_notifications:
			self.send_email_notification(settings)
		
		# Send system notifications
		if settings.send_system_notifications:
			self.send_system_notification(settings)
	
	def send_email_notification(self, settings):
		"""Send email to maintenance team"""
		recipients = []
		
		# Add workshop manager
		if settings.workshop_manager:
			manager = frappe.get_doc("Employee", settings.workshop_manager)
			if manager.user_id:
				recipients.append(manager.user_id)
		
		# Add notification recipients
		for recipient in settings.notification_recipients:
			if recipient.email:
				recipients.append(recipient.email)
			elif recipient.employee:
				emp = frappe.get_doc("Employee", recipient.employee)
				if emp.user_id:
					recipients.append(emp.user_id)
		
		if recipients:
			message = """
			<h3>Vehicle Workshop Entry Notification</h3>
			<p>A vehicle has been moved to the workshop:</p>
			<table style="border-collapse: collapse; width: 100%;">
				<tr>
					<td style="padding: 8px; border: 1px solid #ddd;"><strong>Vehicle:</strong></td>
					<td style="padding: 8px; border: 1px solid #ddd;">{vehicle}</td>
				</tr>
				<tr>
					<td style="padding: 8px; border: 1px solid #ddd;"><strong>Movement Date:</strong></td>
					<td style="padding: 8px; border: 1px solid #ddd;">{movement_date}</td>
				</tr>
				<tr>
					<td style="padding: 8px; border: 1px solid #ddd;"><strong>Workshop Reason:</strong></td>
					<td style="padding: 8px; border: 1px solid #ddd;">{workshop_reason}</td>
				</tr>
				<tr>
					<td style="padding: 8px; border: 1px solid #ddd;"><strong>Estimated Completion:</strong></td>
					<td style="padding: 8px; border: 1px solid #ddd;">{estimated_completion}</td>
				</tr>
				<tr>
					<td style="padding: 8px; border: 1px solid #ddd;"><strong>Odometer Reading:</strong></td>
					<td style="padding: 8px; border: 1px solid #ddd;">{odometer}</td>
				</tr>
				<tr>
					<td style="padding: 8px; border: 1px solid #ddd;"><strong>Purpose:</strong></td>
					<td style="padding: 8px; border: 1px solid #ddd;">{purpose}</td>
				</tr>
			</table>
			<p><a href="{url}">View Vehicle Movement</a></p>
			""".format(
				vehicle=self.vehicle,
				movement_date=self.movement_date,
				workshop_reason=self.workshop_reason or "Not specified",
				estimated_completion=self.estimated_completion_date or "Not specified",
				odometer=self.odometer_reading or "Not recorded",
				purpose=self.purpose or "Not specified",
				url=frappe.utils.get_url_to_form("Vehicle Movements", self.name)
			)
			
			frappe.sendmail(
				recipients=list(set(recipients)),
				subject=_("Vehicle Workshop Entry: {0}").format(self.vehicle),
				message=message,
				reference_doctype=self.doctype,
				reference_name=self.name
			)
	
	def send_system_notification(self, settings):
		"""Send system notification"""
		recipients = []
		
		# Add workshop manager
		if settings.workshop_manager:
			manager = frappe.get_doc("Employee", settings.workshop_manager)
			if manager.user_id:
				recipients.append(manager.user_id)
		
		# Add notification recipients
		for recipient in settings.notification_recipients:
			if recipient.employee:
				emp = frappe.get_doc("Employee", recipient.employee)
				if emp.user_id:
					recipients.append(emp.user_id)
		
		if recipients:
			notification_doc = frappe.get_doc({
				"doctype": "Notification Log",
				"subject": _("Vehicle {0} moved to workshop").format(self.vehicle),
				"for_user": "",
				"type": "Alert",
				"document_type": self.doctype,
				"document_name": self.name,
				"email_content": _("Vehicle {0} has been moved to workshop. Reason: {1}").format(
					self.vehicle,
					self.workshop_reason or "Not specified"
				)
			})
			
			for user in list(set(recipients)):
				notification_doc_copy = frappe.copy_doc(notification_doc)
				notification_doc_copy.for_user = user
				notification_doc_copy.insert(ignore_permissions=True)
	
	def create_workshop_log(self):
		"""Create a log entry for workshop history"""
		frappe.get_doc({
			"doctype": "Comment",
			"comment_type": "Info",
			"reference_doctype": "Vehicle",
			"reference_name": self.vehicle,
			"content": _("Workshop Entry: {0} | Reason: {1} | Est. Completion: {2}").format(
				self.movement_date,
				self.workshop_reason or "Not specified",
				self.estimated_completion_date or "Not specified"
			)
		}).insert(ignore_permissions=True)


@frappe.whitelist()
def mark_workshop_completed(movement_name, actual_completion_date, workshop_notes=None, update_vehicle_status=True):
	"""Mark a workshop movement as completed"""
	doc = frappe.get_doc("Vehicle Movements", movement_name)
	
	if doc.movement_type != "Workshop":
		frappe.throw(_("This is not a workshop movement"))
	
	doc.workshop_status = "Completed"
	doc.actual_completion_date = actual_completion_date
	
	if workshop_notes:
		current_notes = doc.workshop_notes or ""
		timestamp = now_datetime()
		new_note = f"[{timestamp}] Completed\n{workshop_notes}\n\n"
		doc.workshop_notes = new_note + current_notes
	
	doc.save(ignore_permissions=True)
	
	# Update vehicle status back to Available
	if update_vehicle_status:
		vehicle = frappe.get_doc("Vehicle", doc.vehicle)
		vehicle.db_set("status", "Available", update_modified=False)
		vehicle.add_comment(
			"Info",
			_("Vehicle returned from workshop on {0}").format(actual_completion_date)
		)
	
	return doc