CREATE TABLE IF NOT EXISTS `permit_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor_id` text NOT NULL,
	`kind` text NOT NULL,
	`card_serial` text NOT NULL DEFAULT '',
	`permit_expires` text NOT NULL DEFAULT '',
	`note` text NOT NULL DEFAULT '',
	`actor` text NOT NULL,
	`actor_id` text NOT NULL DEFAULT '',
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `idx_permit_documents_vendor` ON `permit_documents` (`vendor_id`, `created_at`);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS `renewal_reminders` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor_id` text NOT NULL,
	`expires` text NOT NULL,
	`days_left` integer NOT NULL DEFAULT 0,
	`status` text NOT NULL DEFAULT 'recorded',
	`note` text NOT NULL DEFAULT '',
	`actor` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_renewal_once_per_expiry` ON `renewal_reminders` (`vendor_id`, `expires`);
