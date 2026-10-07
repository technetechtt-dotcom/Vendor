CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`vendor_id` text NOT NULL,
	`kind` text NOT NULL,
	`amount` integer DEFAULT 0 NOT NULL,
	`note` text NOT NULL,
	`due` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`actor` text NOT NULL,
	`resolved` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`vendor_id`) REFERENCES `vendors`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_events_vendor` ON `events` (`vendor_id`);--> statement-breakpoint
CREATE TABLE `vendors` (
	`id` text PRIMARY KEY NOT NULL,
	`payload` text NOT NULL,
	`updated_at` text NOT NULL
);
