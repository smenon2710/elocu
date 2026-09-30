CREATE TABLE "rate_limits" (
	"user_id" text NOT NULL,
	"bucket" text NOT NULL,
	"window_start" bigint NOT NULL,
	"count" integer NOT NULL,
	CONSTRAINT "rate_limits_user_id_bucket_window_start_pk" PRIMARY KEY("user_id","bucket","window_start")
);
