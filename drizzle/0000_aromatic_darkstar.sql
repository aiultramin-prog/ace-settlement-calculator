CREATE TABLE `aliases` (
	`user_id` text NOT NULL,
	`alias` text NOT NULL,
	`store` text NOT NULL,
	PRIMARY KEY(`user_id`, `alias`)
);
--> statement-breakpoint
CREATE TABLE `rates` (
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`amount` integer NOT NULL,
	`note` text NOT NULL,
	PRIMARY KEY(`user_id`, `name`)
);
--> statement-breakpoint
CREATE TABLE `records` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`created_at` text NOT NULL,
	`fingerprint` text NOT NULL,
	`snapshot` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `records_owner_date` ON `records` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `records_owner_fingerprint` ON `records` (`user_id`,`fingerprint`);