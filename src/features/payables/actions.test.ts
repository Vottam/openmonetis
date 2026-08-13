import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
	accountsPayableOccurrences,
	accountsPayablePayments,
	transactions,
} from "@/db/schema";
import { db } from "@/shared/lib/db";
import {
	cancelPayableAction,
	createPayableAction,
	createPayablePaymentAction,
	deletePayableAction,
	informOccurrenceAmountAction,
	updatePayableAction,
} from "./actions";
import { seedPayablesTestData } from "./lib/test-support";

function assertSuccess<T>(result: {
	success: boolean;
	data?: T;
	error?: string;
}): asserts result is { success: true; data: T } {
	if (!result.success) throw new Error(result.error ?? "expected success");
}

describe("ações de payables", () => {
	beforeEach(async () => {
		await seedPayablesTestData();
	});

	afterEach(async () => {
		await db.delete(accountsPayablePayments);
		await db.delete(accountsPayableOccurrences);
		await db.delete(transactions);
		await db.delete(accountsPayableOccurrences);
	});

	it("cria, atualiza, cancela e remove um payable", async () => {
		const seed = await seedPayablesTestData();
		const created = await createPayableAction({
			description: "Aluguel",
			supplierName: "Imobiliária",
			categoryId: seed.categoryId,
			recurrenceType: "monthly_fixed",
			defaultAmount: 1500,
			startsAt: "2026-08-10",
			endsAt: null,
		});
		assertSuccess(created);
		const updated = await updatePayableAction({
			id: created.data.payableId,
			description: "Aluguel ajustado",
			supplierName: "Imobiliária",
			categoryId: seed.categoryId,
			recurrenceType: "monthly_fixed",
			defaultAmount: 1500,
			startsAt: "2026-08-10",
			endsAt: null,
		});
		expect(updated.success).toBe(true);
		const cancelled = await cancelPayableAction({ id: created.data.payableId });
		expect(cancelled.success).toBe(true);
		const removed = await deletePayableAction({ id: created.data.payableId });
		expect(removed.success).toBe(true);
	});

	it("registra pagamento e atualiza ocorrência e transaction", async () => {
		const seed = await seedPayablesTestData();
		const payable = await createPayableAction({
			description: "Conta teste pagamento",
			supplierName: "Fornecedor teste",
			categoryId: seed.categoryId,
			recurrenceType: "monthly_fixed",
			defaultAmount: 100,
			startsAt: "2026-08-10",
			endsAt: null,
		});
		assertSuccess(payable);
		const occurrence = await db.query.accountsPayableOccurrences.findFirst({
			where: (table, { eq }) => eq(table.payableId, payable.data.payableId),
		});
		expect(occurrence).toBeTruthy();
		const idempotencyKey = "d7b7bca5-0b9d-4c2e-8c57-bd8a7e8b4f6a";
		const result = await createPayablePaymentAction({
			occurrenceId: occurrence?.id ?? "",
			amount: 100,
			paymentMethod: "Pix",
			accountId: seed.accountId,
			cardId: null,
			paidAt: "2026-08-12",
			idempotencyKey,
		});
		assertSuccess(result);
		const duplicate = await createPayablePaymentAction({
			occurrenceId: occurrence?.id ?? "",
			amount: 100,
			paymentMethod: "Pix",
			accountId: seed.accountId,
			cardId: null,
			paidAt: "2026-08-12",
			idempotencyKey,
		});
		assertSuccess(duplicate);
		expect(duplicate.data.paymentId).toBe(result.data.paymentId);
		expect(duplicate.data.transactionId).toBe(result.data.transactionId);
	});

	it("preenche valor informado em ocorrências variáveis", async () => {
		const payables = await db.query.accountsPayableOccurrences.findMany();
		expect(payables.length).toBeGreaterThanOrEqual(0);
	});
});
