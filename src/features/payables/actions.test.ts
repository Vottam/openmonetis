import { afterEach, describe, expect, it } from "vitest";

import {
	accountsPayableOccurrences,
	accountsPayablePayments,
	cards,
	categories,
	financialAccounts,
	transactions,
	user,
} from "@/db/schema";
import {
	deleteTransactionAction,
	updateTransactionAction,
} from "@/features/transactions/actions/single-actions";
import { db } from "@/shared/lib/db";
import {
	cancelPayableAction,
	createPayableAction,
	createPayablePaymentAction,
	deletePayableAction,
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
	afterEach(async () => {
		await db.delete(accountsPayablePayments);
		await db.delete(accountsPayableOccurrences);
		await db.delete(transactions);
		await db.delete(cards);
		await db.delete(financialAccounts);
		await db.delete(categories);
		await db.delete(user);
	});

	it("cria, atualiza, cancela e remove um payable", async () => {
		const localSeed = await seedPayablesTestData();
		const created = await createPayableAction({
			description: "Aluguel",
			supplierName: "Imobiliária",
			categoryId: localSeed.categoryId,
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
			categoryId: localSeed.categoryId,
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
		const localSeed = await seedPayablesTestData();
		const payable = await createPayableAction({
			description: "Conta teste pagamento",
			supplierName: "Fornecedor teste",
			categoryId: localSeed.categoryId,
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
			accountId: localSeed.accountId,
			cardId: null,
			paidAt: "2026-08-12",
			idempotencyKey,
		});
		assertSuccess(result);
		const duplicate = await createPayablePaymentAction({
			occurrenceId: occurrence?.id ?? "",
			amount: 100,
			paymentMethod: "Pix",
			accountId: localSeed.accountId,
			cardId: null,
			paidAt: "2026-08-12",
			idempotencyKey,
		});
		assertSuccess(duplicate);
		expect(duplicate.data.paymentId).toBe(result.data.paymentId);
		expect(duplicate.data.transactionId).toBe(result.data.transactionId);
	});

	it("protege lançamentos automáticos gerados por contas a pagar no motor de transações", async () => {
		const localSeed = await seedPayablesTestData();
		const payable = await createPayableAction({
			description: "Conta guard",
			supplierName: "Fornecedor guard",
			categoryId: localSeed.categoryId,
			recurrenceType: "monthly_fixed",
			defaultAmount: 123.45,
			startsAt: "2026-08-10",
			endsAt: null,
		});
		assertSuccess(payable);
		const occurrence = await db.query.accountsPayableOccurrences.findFirst({
			columns: { id: true },
			where: (table, { eq }) => eq(table.payableId, payable.data.payableId),
		});
		expect(occurrence).toBeTruthy();
		const payment = await createPayablePaymentAction({
			occurrenceId: occurrence?.id ?? "",
			amount: 123.45,
			paymentMethod: "Pix",
			accountId: localSeed.accountId,
			cardId: null,
			paidAt: "2026-08-12",
			idempotencyKey: "1d3d2c2a-4fb1-4d74-9e78-a6ed15be1a11",
		});
		assertSuccess(payment);
		const existing = await db.query.transactions.findFirst({
			columns: { id: true },
			where: (table, { eq }) => eq(table.id, payment.data.transactionId),
		});
		expect(existing).toBeTruthy();

		const updateResult = await updateTransactionAction({
			id: payment.data.transactionId,
			purchaseDate: "2026-08-12",
			period: "2026-08",
			name: "Lançamento automático editado",
			transactionType: "Despesa",
			amount: 123.45,
			condition: "À vista",
			paymentMethod: "Pix",
			payerId: null,
			secondaryPayerId: undefined,
			splitShares: undefined,
			isSplit: false,
			primarySplitAmount: undefined,
			secondarySplitAmount: undefined,
			accountId: localSeed.accountId,
			cardId: null,
			categoryId: localSeed.categoryId,
			note: null,
			installmentCount: undefined,
			startInstallment: undefined,
			recurrenceCount: undefined,
			dueDate: undefined,
			boletoPaymentDate: undefined,
			isSettled: true,
		});
		expect(updateResult.success).toBe(false);
		if (!updateResult.success) {
			expect(updateResult.error).toContain("não podem ser editados");
		}

		const deleteResult = await deleteTransactionAction({
			id: payment.data.transactionId,
		});
		expect(deleteResult.success).toBe(false);
		if (!deleteResult.success) {
			expect(deleteResult.error).toContain("não podem ser removidos");
		}
	});

	it("permite pagamento em cartão e preserva o bloqueio do lançamento gerado", async () => {
		const localSeed = await seedPayablesTestData();
		const payable = await createPayableAction({
			description: "Conta cartão",
			supplierName: "Fornecedor cartão",
			categoryId: localSeed.categoryId,
			recurrenceType: "monthly_fixed",
			defaultAmount: 80,
			startsAt: "2026-08-10",
			endsAt: null,
		});
		assertSuccess(payable);
		const occurrence = await db.query.accountsPayableOccurrences.findFirst({
			where: (table, { eq }) => eq(table.payableId, payable.data.payableId),
		});
		expect(occurrence).toBeTruthy();
		const payment = await createPayablePaymentAction({
			occurrenceId: occurrence?.id ?? "",
			amount: 80,
			paymentMethod: "Cartão de crédito",
			accountId: null,
			cardId: localSeed.cardId,
			paidAt: "2026-08-12",
			idempotencyKey: "2d3d2c2a-4fb1-4d74-9e78-a6ed15be1a22",
		});
		assertSuccess(payment);
		const tx = await db.query.transactions.findFirst({
			where: (table, { eq }) => eq(table.id, payment.data.transactionId),
		});
		expect(tx?.cardId).toBe(localSeed.cardId);
		expect(tx?.accountId).toBeNull();
		expect(tx?.note?.startsWith("AUTO_CONTA_A_PAGAR:")).toBe(true);
	});
});
