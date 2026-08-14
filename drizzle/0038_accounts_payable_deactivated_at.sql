--> statement-breakpoint
ALTER TABLE "accounts_payable" ADD COLUMN "deactivated_at" date;
--> statement-breakpoint
UPDATE "accounts_payable"
SET "deactivated_at" = COALESCE("deactivated_at", ("updated_at" AT TIME ZONE 'UTC')::date)
WHERE "status" = 'cancelled' AND "deactivated_at" IS NULL;
