--> statement-breakpoint
CREATE TABLE "accounts_payable_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"occurrence_id" uuid NOT NULL,
	"transaction_id" uuid NOT NULL,
	"amount" numeric(12, 2) NOT NULL,
	"paid_at" date NOT NULL,
	"payment_method" text NOT NULL,
	"account_id" uuid,
	"card_id" uuid,
	"category_id" uuid,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts_payable_payments" ADD CONSTRAINT "accounts_payable_payments_occurrence_id_accounts_payable_occurrences_id_fk" FOREIGN KEY ("occurrence_id") REFERENCES "public"."accounts_payable_occurrences"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "accounts_payable_payments" ADD CONSTRAINT "accounts_payable_payments_transaction_id_lancamentos_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."lancamentos"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "accounts_payable_payments" ADD CONSTRAINT "accounts_payable_payments_account_id_contas_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."contas"("id") ON DELETE set null ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "accounts_payable_payments" ADD CONSTRAINT "accounts_payable_payments_card_id_cartoes_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cartoes"("id") ON DELETE set null ON UPDATE cascade;
--> statement-breakpoint
ALTER TABLE "accounts_payable_payments" ADD CONSTRAINT "accounts_payable_payments_category_id_categorias_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categorias"("id") ON DELETE set null ON UPDATE cascade;
--> statement-breakpoint
CREATE INDEX "accounts_payable_payments_occurrence_id_idx" ON "accounts_payable_payments" USING btree ("occurrence_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_payable_payments_transaction_id_key" ON "accounts_payable_payments" USING btree ("transaction_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_payable_payments_idempotency_key_key" ON "accounts_payable_payments" USING btree ("idempotency_key");
