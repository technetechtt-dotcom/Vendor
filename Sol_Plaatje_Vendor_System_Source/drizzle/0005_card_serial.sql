CREATE UNIQUE INDEX IF NOT EXISTS `idx_permits_card_serial` ON `permits` (`card_serial`) WHERE `card_serial` <> '';
