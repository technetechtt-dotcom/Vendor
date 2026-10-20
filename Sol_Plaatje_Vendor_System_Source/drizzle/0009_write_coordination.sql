CREATE TABLE `operation_leases` (
  `name` text PRIMARY KEY NOT NULL,
  `token` text NOT NULL,
  `expires_at` text NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER `hubs_no_orphan_delete` BEFORE DELETE ON `hubs`
WHEN EXISTS (SELECT 1 FROM `hub_units` WHERE hub_id=OLD.id)
  OR EXISTS (SELECT 1 FROM `allocations` WHERE hub_id=OLD.id)
  OR EXISTS (SELECT 1 FROM `allocation_history` WHERE hub_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'Release dependent hub records before deletion.'); END;
--> statement-breakpoint
CREATE TRIGGER `units_no_orphan_delete` BEFORE DELETE ON `hub_units`
WHEN EXISTS (SELECT 1 FROM `allocations` WHERE hub_id=OLD.hub_id AND unit=OLD.unit_code)
BEGIN SELECT RAISE(ABORT,'Release the allocation before deleting this unit.'); END;
--> statement-breakpoint
CREATE TRIGGER `vendors_no_orphan_evidence_delete` BEFORE DELETE ON `vendors`
WHEN EXISTS (SELECT 1 FROM `attachments` WHERE vendor_id=OLD.id)
  OR EXISTS (SELECT 1 FROM `pitches` WHERE vendor_id=OLD.id)
  OR EXISTS (SELECT 1 FROM `allocation_history` WHERE vendor_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'Release dependent vendor evidence and history before deletion.'); END;
