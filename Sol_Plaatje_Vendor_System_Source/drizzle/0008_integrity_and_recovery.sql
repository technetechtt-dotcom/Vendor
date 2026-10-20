CREATE TABLE IF NOT EXISTS `integrity_issues` (
	`id` text PRIMARY KEY NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`parent_id` text DEFAULT '' NOT NULL,
	`issue` text NOT NULL,
	`payload` text DEFAULT '' NOT NULL,
	`detected_at` text NOT NULL,
	`resolved_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_integrity_open` ON `integrity_issues` (`resolved_at`, `entity`, `detected_at`);
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `reconciliation_ref` text DEFAULT '' NOT NULL;
--> statement-breakpoint
INSERT INTO `integrity_issues` (`id`,`entity`,`entity_id`,`parent_id`,`issue`,`payload`,`detected_at`)
SELECT lower(hex(randomblob(16))),'notice_deliveries',n.id,n.event_id,'Missing parent event',json_object('method',n.method,'status',n.status,'detail',n.detail),'2026-10-15T00:00:00Z'
FROM `notice_deliveries` n WHERE NOT EXISTS (SELECT 1 FROM `events` e WHERE e.id=n.event_id);
--> statement-breakpoint
DELETE FROM `notice_deliveries` WHERE NOT EXISTS (SELECT 1 FROM `events` e WHERE e.id=`notice_deliveries`.event_id);
--> statement-breakpoint
INSERT INTO `integrity_issues` (`id`,`entity`,`entity_id`,`parent_id`,`issue`,`payload`,`detected_at`)
SELECT lower(hex(randomblob(16))),'submission_keys',s.user_id||':'||s.idempotency_key,s.event_id,'Missing parent event',json_object('created_at',s.created_at),'2026-10-15T00:00:00Z'
FROM `submission_keys` s WHERE NOT EXISTS (SELECT 1 FROM `events` e WHERE e.id=s.event_id);
--> statement-breakpoint
DELETE FROM `submission_keys` WHERE NOT EXISTS (SELECT 1 FROM `events` e WHERE e.id=`submission_keys`.event_id);
--> statement-breakpoint
INSERT INTO `integrity_issues` (`id`,`entity`,`entity_id`,`parent_id`,`issue`,`payload`,`detected_at`)
SELECT lower(hex(randomblob(16))),'allocations',a.vendor_id||':'||a.unit,a.vendor_id,'Missing vendor, hub or inventory unit',json_object('hub',a.hub,'hub_id',a.hub_id,'unit',a.unit),'2026-10-15T00:00:00Z'
FROM `allocations` a
WHERE NOT EXISTS (SELECT 1 FROM `vendors` v WHERE v.id=a.vendor_id)
   OR NOT EXISTS (SELECT 1 FROM `hubs` h WHERE h.id=a.hub_id)
   OR NOT EXISTS (SELECT 1 FROM `hub_units` u WHERE u.hub_id=a.hub_id AND u.unit_code=a.unit);
--> statement-breakpoint
DELETE FROM `allocations`
WHERE NOT EXISTS (SELECT 1 FROM `vendors` v WHERE v.id=`allocations`.vendor_id)
   OR NOT EXISTS (SELECT 1 FROM `hubs` h WHERE h.id=`allocations`.hub_id)
   OR NOT EXISTS (SELECT 1 FROM `hub_units` u WHERE u.hub_id=`allocations`.hub_id AND u.unit_code=`allocations`.unit);
--> statement-breakpoint
INSERT INTO `integrity_issues` (`id`,`entity`,`entity_id`,`parent_id`,`issue`,`payload`,`detected_at`)
SELECT lower(hex(randomblob(16))),'events',e.id,e.vendor_id,'Missing parent vendor',json_object('kind',e.kind,'amount',e.amount,'note',e.note,'created_at',e.created_at),'2026-10-15T00:00:00Z'
FROM `events` e WHERE NOT EXISTS (SELECT 1 FROM `vendors` v WHERE v.id=e.vendor_id);
--> statement-breakpoint
DELETE FROM `events` WHERE NOT EXISTS (SELECT 1 FROM `vendors` v WHERE v.id=`events`.vendor_id);
--> statement-breakpoint
INSERT INTO `integrity_issues` (`id`,`entity`,`entity_id`,`parent_id`,`issue`,`payload`,`detected_at`)
SELECT lower(hex(randomblob(16))),'permits',p.id,p.vendor_id,'Missing parent vendor',json_object('permit_number',p.permit_number,'card_serial',p.card_serial,'status',p.status,'note',p.note,'created_at',p.created_at),'2026-10-15T00:00:00Z'
FROM `permits` p WHERE NOT EXISTS (SELECT 1 FROM `vendors` v WHERE v.id=p.vendor_id);
--> statement-breakpoint
DELETE FROM `permits` WHERE NOT EXISTS (SELECT 1 FROM `vendors` v WHERE v.id=`permits`.vendor_id);
--> statement-breakpoint
INSERT INTO `integrity_issues` (`id`,`entity`,`entity_id`,`parent_id`,`issue`,`payload`,`detected_at`)
SELECT lower(hex(randomblob(16))),'permit_documents',p.id,p.vendor_id,'Missing parent vendor',json_object('kind',p.kind,'card_serial',p.card_serial,'note',p.note,'created_at',p.created_at),'2026-10-15T00:00:00Z'
FROM `permit_documents` p WHERE NOT EXISTS (SELECT 1 FROM `vendors` v WHERE v.id=p.vendor_id);
--> statement-breakpoint
DELETE FROM `permit_documents` WHERE NOT EXISTS (SELECT 1 FROM `vendors` v WHERE v.id=`permit_documents`.vendor_id);
--> statement-breakpoint
INSERT INTO `integrity_issues` (`id`,`entity`,`entity_id`,`parent_id`,`issue`,`payload`,`detected_at`)
SELECT lower(hex(randomblob(16))),'renewal_reminders',r.id,r.vendor_id,'Missing parent vendor',json_object('expires',r.expires,'status',r.status,'note',r.note),'2026-10-15T00:00:00Z'
FROM `renewal_reminders` r WHERE NOT EXISTS (SELECT 1 FROM `vendors` v WHERE v.id=r.vendor_id);
--> statement-breakpoint
DELETE FROM `renewal_reminders` WHERE NOT EXISTS (SELECT 1 FROM `vendors` v WHERE v.id=`renewal_reminders`.vendor_id);
--> statement-breakpoint
INSERT INTO `integrity_issues` (`id`,`entity`,`entity_id`,`parent_id`,`issue`,`payload`,`detected_at`)
SELECT lower(hex(randomblob(16))),'allocation_history',a.id,a.vendor_id,'Missing parent vendor or hub',json_object('hub_id',a.hub_id,'unit_code',a.unit_code,'action',a.action,'note',a.note,'created_at',a.created_at),'2026-10-15T00:00:00Z'
FROM `allocation_history` a
WHERE NOT EXISTS (SELECT 1 FROM `vendors` v WHERE v.id=a.vendor_id)
   OR (a.hub_id<>'' AND NOT EXISTS (SELECT 1 FROM `hubs` h WHERE h.id=a.hub_id));
--> statement-breakpoint
DELETE FROM `allocation_history`
WHERE NOT EXISTS (SELECT 1 FROM `vendors` v WHERE v.id=`allocation_history`.vendor_id)
   OR (`allocation_history`.hub_id<>'' AND NOT EXISTS (SELECT 1 FROM `hubs` h WHERE h.id=`allocation_history`.hub_id));
--> statement-breakpoint
INSERT INTO `integrity_issues` (`id`,`entity`,`entity_id`,`parent_id`,`issue`,`payload`,`detected_at`)
SELECT lower(hex(randomblob(16))),'pitches',p.id,p.vendor_id,'Missing parent vendor',json_object('pitch_code',p.pitch_code,'area',p.area,'lat',p.lat,'lng',p.lng),'2026-10-15T00:00:00Z'
FROM `pitches` p WHERE p.vendor_id<>'' AND NOT EXISTS (SELECT 1 FROM `vendors` v WHERE v.id=p.vendor_id);
--> statement-breakpoint
UPDATE `pitches` SET `vendor_id`='' WHERE `vendor_id`<>'' AND NOT EXISTS (SELECT 1 FROM `vendors` v WHERE v.id=`pitches`.vendor_id);
--> statement-breakpoint
INSERT INTO `integrity_issues` (`id`,`entity`,`entity_id`,`parent_id`,`issue`,`payload`,`detected_at`)
SELECT lower(hex(randomblob(16))),'attachments',a.key,a.vendor_id,'Missing parent vendor',json_object('kind',a.kind,'label',a.label,'name',a.name,'created_at',a.created_at),'2026-10-15T00:00:00Z'
FROM `attachments` a WHERE a.vendor_id<>'' AND NOT EXISTS (SELECT 1 FROM `vendors` v WHERE v.id=a.vendor_id);
--> statement-breakpoint
UPDATE `attachments` SET `vendor_id`='' WHERE `vendor_id`<>'' AND NOT EXISTS (SELECT 1 FROM `vendors` v WHERE v.id=`attachments`.vendor_id);
--> statement-breakpoint
INSERT INTO `integrity_issues` (`id`,`entity`,`entity_id`,`parent_id`,`issue`,`payload`,`detected_at`)
SELECT lower(hex(randomblob(16))),'hub_units',u.id,u.hub_id,'Missing parent hub',json_object('unit_code',u.unit_code,'status',u.status,'notes',u.notes),'2026-10-15T00:00:00Z'
FROM `hub_units` u WHERE NOT EXISTS (SELECT 1 FROM `hubs` h WHERE h.id=u.hub_id);
--> statement-breakpoint
DELETE FROM `hub_units` WHERE NOT EXISTS (SELECT 1 FROM `hubs` h WHERE h.id=`hub_units`.hub_id);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `events_vendor_insert` BEFORE INSERT ON `events`
WHEN NOT EXISTS (SELECT 1 FROM `vendors` WHERE id=NEW.vendor_id)
BEGIN SELECT RAISE(ABORT,'Vendor does not exist.'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `events_vendor_update` BEFORE UPDATE OF `vendor_id` ON `events`
WHEN NOT EXISTS (SELECT 1 FROM `vendors` WHERE id=NEW.vendor_id)
BEGIN SELECT RAISE(ABORT,'Vendor does not exist.'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `allocations_parent_insert` BEFORE INSERT ON `allocations`
WHEN NOT EXISTS (SELECT 1 FROM `vendors` WHERE id=NEW.vendor_id)
  OR NOT EXISTS (SELECT 1 FROM `hubs` WHERE id=NEW.hub_id)
  OR NOT EXISTS (SELECT 1 FROM `hub_units` WHERE hub_id=NEW.hub_id AND unit_code=NEW.unit)
BEGIN SELECT RAISE(ABORT,'Allocation requires an existing vendor, hub and inventory unit.'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `allocations_parent_update` BEFORE UPDATE ON `allocations`
WHEN NOT EXISTS (SELECT 1 FROM `vendors` WHERE id=NEW.vendor_id)
  OR NOT EXISTS (SELECT 1 FROM `hubs` WHERE id=NEW.hub_id)
  OR NOT EXISTS (SELECT 1 FROM `hub_units` WHERE hub_id=NEW.hub_id AND unit_code=NEW.unit)
BEGIN SELECT RAISE(ABORT,'Allocation requires an existing vendor, hub and inventory unit.'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `hub_units_parent_insert` BEFORE INSERT ON `hub_units`
WHEN NOT EXISTS (SELECT 1 FROM `hubs` WHERE id=NEW.hub_id)
BEGIN SELECT RAISE(ABORT,'Hub does not exist.'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `hub_units_parent_update` BEFORE UPDATE OF `hub_id` ON `hub_units`
WHEN NOT EXISTS (SELECT 1 FROM `hubs` WHERE id=NEW.hub_id)
BEGIN SELECT RAISE(ABORT,'Hub does not exist.'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `permits_vendor_insert` BEFORE INSERT ON `permits`
WHEN NOT EXISTS (SELECT 1 FROM `vendors` WHERE id=NEW.vendor_id)
BEGIN SELECT RAISE(ABORT,'Vendor does not exist.'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `permit_documents_vendor_insert` BEFORE INSERT ON `permit_documents`
WHEN NOT EXISTS (SELECT 1 FROM `vendors` WHERE id=NEW.vendor_id)
BEGIN SELECT RAISE(ABORT,'Vendor does not exist.'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `renewals_vendor_insert` BEFORE INSERT ON `renewal_reminders`
WHEN NOT EXISTS (SELECT 1 FROM `vendors` WHERE id=NEW.vendor_id)
BEGIN SELECT RAISE(ABORT,'Vendor does not exist.'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `allocation_history_parent_insert` BEFORE INSERT ON `allocation_history`
WHEN NOT EXISTS (SELECT 1 FROM `vendors` WHERE id=NEW.vendor_id)
  OR (NEW.hub_id<>'' AND NOT EXISTS (SELECT 1 FROM `hubs` WHERE id=NEW.hub_id))
BEGIN SELECT RAISE(ABORT,'Allocation history requires an existing vendor and hub.'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `pitches_vendor_insert` BEFORE INSERT ON `pitches`
WHEN NEW.vendor_id<>'' AND NOT EXISTS (SELECT 1 FROM `vendors` WHERE id=NEW.vendor_id)
BEGIN SELECT RAISE(ABORT,'Vendor does not exist.'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `pitches_vendor_update` BEFORE UPDATE OF `vendor_id` ON `pitches`
WHEN NEW.vendor_id<>'' AND NOT EXISTS (SELECT 1 FROM `vendors` WHERE id=NEW.vendor_id)
BEGIN SELECT RAISE(ABORT,'Vendor does not exist.'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `attachments_vendor_update` BEFORE UPDATE OF `vendor_id` ON `attachments`
WHEN NEW.vendor_id<>'' AND NOT EXISTS (SELECT 1 FROM `vendors` WHERE id=NEW.vendor_id)
BEGIN SELECT RAISE(ABORT,'Vendor does not exist.'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `notice_event_insert` BEFORE INSERT ON `notice_deliveries`
WHEN NOT EXISTS (SELECT 1 FROM `events` WHERE id=NEW.event_id)
BEGIN SELECT RAISE(ABORT,'Notice requires an existing event.'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `submission_event_insert` BEFORE INSERT ON `submission_keys`
WHEN NOT EXISTS (SELECT 1 FROM `events` WHERE id=NEW.event_id)
BEGIN SELECT RAISE(ABORT,'Submission key requires an existing event.'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `vendors_no_orphan_delete` BEFORE DELETE ON `vendors`
WHEN EXISTS (SELECT 1 FROM `events` WHERE vendor_id=OLD.id)
  OR EXISTS (SELECT 1 FROM `allocations` WHERE vendor_id=OLD.id)
  OR EXISTS (SELECT 1 FROM `permits` WHERE vendor_id=OLD.id)
  OR EXISTS (SELECT 1 FROM `permit_documents` WHERE vendor_id=OLD.id)
  OR EXISTS (SELECT 1 FROM `renewal_reminders` WHERE vendor_id=OLD.id)
BEGIN SELECT RAISE(ABORT,'Release or archive dependent vendor records before deletion.'); END;

