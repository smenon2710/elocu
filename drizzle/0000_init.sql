CREATE TABLE "feedback" (
	"session_id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"generated_at" bigint NOT NULL,
	"sections" jsonb NOT NULL,
	"grading_failed" boolean DEFAULT false NOT NULL,
	"empty_transcript" boolean DEFAULT false NOT NULL,
	"graded_turn_count" integer
);
--> statement-breakpoint
CREATE TABLE "grading_failures" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"session_id" text NOT NULL,
	"reason" text NOT NULL,
	"raw" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "llm_call_logs" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"ts" timestamp with time zone NOT NULL,
	"duration_ms" integer NOT NULL,
	"provider" text NOT NULL,
	"label" text NOT NULL,
	"session_id" text,
	"model" text NOT NULL,
	"message_count" integer NOT NULL,
	"ok" boolean NOT NULL,
	"status" integer,
	"error" text,
	"usage" jsonb,
	"provider_request_id" text
);
--> statement-breakpoint
CREATE TABLE "objectives" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"title" text NOT NULL,
	"note" text,
	"targets" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"created_at" bigint NOT NULL,
	"ended_at" bigint,
	"mode" text NOT NULL,
	"topic" text NOT NULL,
	"documents_used" boolean NOT NULL,
	"document_refs" jsonb NOT NULL,
	"turns" jsonb NOT NULL,
	"pitch_time_limit_sec" integer,
	"goal_label" text
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_session_id_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "feedback_user_idx" ON "feedback" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "grading_failures_session_idx" ON "grading_failures" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "llm_call_logs_session_idx" ON "llm_call_logs" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "objectives_user_idx" ON "objectives" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_created_idx" ON "sessions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "sessions_user_goal_idx" ON "sessions" USING btree ("user_id","goal_label");