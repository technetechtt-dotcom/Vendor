ALTER TABLE `audit_log` ADD COLUMN `actor_id` text DEFAULT '' NOT NULL;
--> statement-breakpoint
ALTER TABLE `audit_log` ADD COLUMN `seq` integer;
--> statement-breakpoint
UPDATE `audit_log` SET `seq` = `rowid` WHERE `seq` IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_audit_seq` ON `audit_log` (`seq`) WHERE `seq` IS NOT NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_audit_actor` ON `audit_log` (`actor_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `audit_chain` (
	`id` integer PRIMARY KEY CHECK (`id` = 1),
	`last_hash` text NOT NULL DEFAULT '',
	`last_seq` integer NOT NULL DEFAULT 0,
	`rows_sealed` integer NOT NULL DEFAULT 0,
	`updated_at` text NOT NULL DEFAULT ''
);
--> statement-breakpoint
INSERT OR IGNORE INTO `audit_chain` (`id`, `last_hash`, `last_seq`, `rows_sealed`, `updated_at`) VALUES (1, '', 0, 0, '');
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `audit_log_no_update`
BEFORE UPDATE ON `audit_log`
BEGIN
	SELECT RAISE(ABORT, 'The audit log is append-only. Corrections are recorded as new entries.');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS `audit_log_no_delete`
BEFORE DELETE ON `audit_log`
BEGIN
	SELECT RAISE(ABORT, 'The audit log is append-only. Records cannot be deleted.');
END;
