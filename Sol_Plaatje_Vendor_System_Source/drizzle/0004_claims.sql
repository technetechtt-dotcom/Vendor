CREATE UNIQUE INDEX IF NOT EXISTS `idx_events_one_reversal` ON `events` (`reversal_of`) WHERE `reversal_of` <> '';
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `idx_notice_municipal_claim` ON `notice_deliveries` (`event_id`) WHERE `method` = 'municipal' AND `status` IN ('sending', 'accepted by sender');
