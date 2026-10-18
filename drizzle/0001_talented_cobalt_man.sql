CREATE TABLE `viewers` (
	`owner_id` text NOT NULL,
	`viewer_id` text NOT NULL,
	`label` text NOT NULL,
	PRIMARY KEY(`owner_id`, `viewer_id`)
);
