ALTER TABLE `allocations` ADD COLUMN `hub_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
UPDATE `allocations` SET `hub_id` = COALESCE((SELECT `id` FROM `hubs` WHERE `hubs`.`name` = `allocations`.`hub` COLLATE NOCASE), '') WHERE `hub_id` = '';
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `gps_lat` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `gps_lng` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `gps_accuracy` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `owner` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `severity` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `case_status` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `checklist` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `evidence` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `follow_up_of` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `snapshot` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `receipt_no` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `pay_method` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `pay_ref` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `cashier` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `reconciled` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
ALTER TABLE `events` ADD COLUMN `reversal_of` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `notice_deliveries` ADD COLUMN `recipient` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `notice_deliveries` ADD COLUMN `provider_ref` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `notice_deliveries` ADD COLUMN `failure_reason` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `notice_deliveries` ADD COLUMN `idempotency_key` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `hub_units` (
	`id` text PRIMARY KEY NOT NULL,
	`hub_id` text NOT NULL,
	`unit_code` text NOT NULL,
	`capacity` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'available' NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	UNIQUE(`hub_id`, `unit_code`)
);
--> statement-breakpoint
INSERT OR IGNORE INTO `hub_units` (`id`, `hub_id`, `unit_code`, `capacity`, `status`, `notes`)
SELECT lower(hex(randomblob(16))), `hub_id`, `unit`, 1, 'occupied', ''
FROM `allocations` WHERE `hub_id` <> '';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `pitches` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor_id` text DEFAULT '' NOT NULL,
	`pitch_code` text NOT NULL,
	`ward` text DEFAULT '' NOT NULL,
	`area` text DEFAULT '' NOT NULL,
	`activity` text DEFAULT '' NOT NULL,
	`lat` text DEFAULT '' NOT NULL,
	`lng` text DEFAULT '' NOT NULL,
	`accuracy` text DEFAULT '' NOT NULL,
	`verified_at` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
INSERT OR IGNORE INTO `pitches` (`id`, `vendor_id`, `pitch_code`, `ward`, `area`, `activity`, `lat`, `lng`, `accuracy`, `verified_at`)
SELECT `id`, `id`, TRIM(COALESCE(json_extract(`payload`, '$.unit'), '')), '', TRIM(COALESCE(json_extract(`payload`, '$.address'), '')), TRIM(COALESCE(json_extract(`payload`, '$.sector'), '')), TRIM(COALESCE(json_extract(`payload`, '$.lat'), '')), TRIM(COALESCE(json_extract(`payload`, '$.lng'), '')), '', ''
FROM `vendors` WHERE json_extract(`payload`, '$.type') = 'Informal';
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `fee_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`category` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`effective_from` text NOT NULL,
	`effective_to` text DEFAULT '' NOT NULL,
	`applicability` text DEFAULT '' NOT NULL,
	`approval_ref` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `permits` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor_id` text NOT NULL,
	`permit_number` text NOT NULL,
	`card_serial` text DEFAULT '' NOT NULL,
	`status` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`rule_ref` text NOT NULL,
	`category` text DEFAULT '' NOT NULL,
	`document_label` text NOT NULL,
	`validity_months` integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `allocation_history` (
	`id` text PRIMARY KEY NOT NULL,
	`hub_id` text DEFAULT '' NOT NULL,
	`unit_code` text NOT NULL,
	`vendor_id` text NOT NULL,
	`action` text NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL,
	`note` text DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `attachments` (
	`key` text PRIMARY KEY NOT NULL,
	`kind` text NOT NULL,
	`vendor_id` text DEFAULT '' NOT NULL,
	`label` text DEFAULT '' NOT NULL,
	`name` text DEFAULT '' NOT NULL,
	`created_by` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `import_rows` (
	`id` text PRIMARY KEY NOT NULL,
	`batch_id` text NOT NULL,
	`payload` text NOT NULL,
	`status` text NOT NULL,
	`note` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `audit_log` (
	`id` text PRIMARY KEY NOT NULL,
	`entity` text NOT NULL,
	`entity_id` text NOT NULL,
	`action` text NOT NULL,
	`before_json` text DEFAULT '' NOT NULL,
	`after_json` text DEFAULT '' NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_audit_created` ON `audit_log` (`created_at`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_notice_once` ON `notice_deliveries` (`event_id`, `method`);
