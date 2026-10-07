ALTER TABLE `users` ADD COLUMN `must_change_password` integer DEFAULT 0 NOT NULL;
--> statement-breakpoint
UPDATE `users` SET `must_change_password` = 1 WHERE `id` = 'user-superuser';
--> statement-breakpoint
DELETE FROM `sessions` WHERE `user_id` = 'user-superuser';
--> statement-breakpoint
ALTER TABLE `sessions` ADD COLUMN `device` text DEFAULT '' NOT NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `app_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `login_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`ip` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `login_attempts_email` ON `login_attempts` (`email`, `created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `allocations` (
	`hub` text NOT NULL COLLATE NOCASE,
	`unit` text NOT NULL COLLATE NOCASE,
	`vendor_id` text NOT NULL UNIQUE,
	PRIMARY KEY (`hub`, `unit`)
);
--> statement-breakpoint
INSERT OR IGNORE INTO `allocations` (`hub`, `unit`, `vendor_id`)
SELECT TRIM(json_extract(`payload`, '$.hub')), TRIM(json_extract(`payload`, '$.unit')), `id`
FROM `vendors`
WHERE json_extract(`payload`, '$.type') = 'Formal'
	AND length(TRIM(COALESCE(json_extract(`payload`, '$.unit'), ''))) > 0
	AND length(TRIM(COALESCE(json_extract(`payload`, '$.hub'), ''))) > 0;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `submission_keys` (
	`user_id` text NOT NULL,
	`idempotency_key` text NOT NULL,
	`event_id` text NOT NULL,
	`created_at` text NOT NULL,
	PRIMARY KEY (`user_id`, `idempotency_key`)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `notice_deliveries` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` text NOT NULL,
	`method` text NOT NULL,
	`status` text NOT NULL,
	`detail` text DEFAULT '' NOT NULL,
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `notice_deliveries_event` ON `notice_deliveries` (`event_id`, `created_at`);
--> statement-breakpoint
INSERT OR IGNORE INTO `hubs` (`id`, `name`, `created_at`, `updated_at`) VALUES
	('hub-craven', 'Craven Street Container Hub', '2026-01-01T00:00:00Z', '2026-01-01T00:00:00Z'),
	('hub-arena', 'Arena Container Hub', '2026-01-01T00:00:01Z', '2026-01-01T00:00:01Z'),
	('hub-platfontein', 'Platfontein Container Hub', '2026-01-01T00:00:02Z', '2026-01-01T00:00:02Z'),
	('hub-greenpoint', 'Greenpoint Container Hub', '2026-01-01T00:00:03Z', '2026-01-01T00:00:03Z'),
	('hub-galeshewe', 'Galeshewe SMME Village', '2026-01-01T00:00:04Z', '2026-01-01T00:00:04Z');
