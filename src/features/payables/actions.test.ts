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
import { fetchAllAccountsForUser } from "@/features/accounts/queries";
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

	it("registra pagamento, atualiza ocorrência e respeita idempotência", async () => {
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

	it("faz pagamento parcial em duas etapas, fecha a ocorrência e debita a conta bancária", async () => {
		const localSeed = await seedPayablesTestData();
		const payable = await createPayableAction({
			description: "Conta parcial",
			supplierName: "Fornecedor parcial",
			categoryId: localSeed.categoryId,
			recurrenceType: "monthly_fixed",
			defaultAmount: 100,
			startsAt: "2026-08-10",
			endsAt: null,
		});
		assertSuccess(payable);

		const occurrence = await db.query.accountsPayableOccurrences.findFirst({
			columns: {
				id: true,
				expectedAmount: true,
				actualAmount: true,
				status: true,
			},
			with: {
				payments: {
					columns: { id: true, amount: true, transactionId: true },
				},
			},
			where: (table, { eq }) => eq(table.payableId, payable.data.payableId),
		});
		expect(occurrence).toBeTruthy();
		const occurrenceId = occurrence?.id ?? "";

		const firstPayment = await createPayablePaymentAction({
			occurrenceId,
			amount: 40,
			paymentMethod: "Pix",
			accountId: localSeed.accountId,
			cardId: null,
			paidAt: "2026-08-12",
			idempotencyKey: "a1b4f5a6-8b0c-4d7d-9b58-2f1c2a3d4e5f",
		});
		assertSuccess(firstPayment);

		const afterFirst = await db.query.accountsPayableOccurrences.findFirst({
			columns: {
				id: true,
				expectedAmount: true,
				actualAmount: true,
				status: true,
			},
			with: {
				payments: {
					columns: { id: true, amount: true, transactionId: true },
				},
			},
			where: (table, { eq }) => eq(table.id, occurrenceId),
		});
		expect(afterFirst).toBeTruthy();
		const firstPaid = (afterFirst?.payments ?? []).reduce(
			(sum, payment) => sum + Number(payment.amount),
			0,
		);
		expect(Number(afterFirst?.actualAmount ?? 0)).toBe(40);
		expect(Number(afterFirst?.expectedAmount ?? 0)).toBe(100);
		expect(firstPaid).toBe(40);
		expect(afterFirst?.status).toBe("partial");
		expect(Number(afterFirst?.expectedAmount ?? 0) - firstPaid).toBe(60);

		const bankAfterFirst = await db.query.transactions.findMany({
			columns: { amount: true, accountId: true, cardId: true, note: true },
			where: (table, { and, eq }) =>
				and(
					eq(table.userId, localSeed.userId),
					eq(table.accountId, localSeed.accountId),
				),
		});
		expect(bankAfterFirst).toHaveLength(1);
		expect(Number(bankAfterFirst[0]?.amount ?? 0)).toBe(-40);
		expect(bankAfterFirst[0]?.cardId).toBeNull();
		expect(bankAfterFirst[0]?.note?.startsWith("AUTO_CONTA_A_PAGAR:")).toBe(
			true,
		);
		const balancesAfterFirst = await fetchAllAccountsForUser(localSeed.userId);
		expect(
			balancesAfterFirst.activeAccounts.find(
				(account) => account.id === localSeed.accountId,
			)?.balance,
		).toBe(-40);

		const secondPayment = await createPayablePaymentAction({
			occurrenceId,
			amount: 60,
			paymentMethod: "Pix",
			accountId: localSeed.accountId,
			cardId: null,
			paidAt: "2026-08-12",
			idempotencyKey: "b2c5f6a7-9c1d-4e8e-a9c6-3f2d4a5b6c7d",
		});
		assertSuccess(secondPayment);

		const afterSecond = await db.query.accountsPayableOccurrences.findFirst({
			columns: {
				id: true,
				expectedAmount: true,
				actualAmount: true,
				status: true,
			},
			with: {
				payments: {
					columns: { id: true, amount: true, transactionId: true },
				},
			},
			where: (table, { eq }) => eq(table.id, occurrenceId),
		});
		expect(afterSecond).toBeTruthy();
		const secondPaid = (afterSecond?.payments ?? []).reduce(
			(sum, payment) => sum + Number(payment.amount),
			0,
		);
		expect(Number(afterSecond?.actualAmount ?? 0)).toBe(100);
		expect(Number(afterSecond?.expectedAmount ?? 0)).toBe(100);
		expect(secondPaid).toBe(100);
		expect(afterSecond?.status).toBe("paid");
		expect(Number(afterSecond?.expectedAmount ?? 0) - secondPaid).toBe(0);
		expect(afterSecond?.payments).toHaveLength(2);
		expect(
			new Set(
				(afterSecond?.payments ?? []).map((payment) => payment.transactionId),
			).size,
		).toBe(2);

		const payments = await db.query.accountsPayablePayments.findMany({
			columns: { id: true, amount: true, transactionId: true },
			where: (table, { eq }) => eq(table.occurrenceId, occurrenceId),
		});
		expect(payments).toHaveLength(2);
		expect(new Set(payments.map((payment) => payment.transactionId)).size).toBe(
			2,
		);

		const bankTransactions = await db.query.transactions.findMany({
			columns: { amount: true, accountId: true, cardId: true, note: true },
			where: (table, { and, eq }) =>
				and(
					eq(table.userId, localSeed.userId),
					eq(table.accountId, localSeed.accountId),
				),
		});
		expect(bankTransactions).toHaveLength(2);
		expect(bankTransactions.every((tx) => tx.cardId === null)).toBe(true);
		expect(
			bankTransactions.every((tx) =>
				tx.note?.startsWith("AUTO_CONTA_A_PAGAR:"),
			),
		).toBe(true);
		expect(
			bankTransactions.map((tx) => Number(tx.amount)).sort((a, b) => a - b),
		).toEqual([-60, -40]);
		expect(
			bankTransactions.reduce((sum, tx) => sum + Number(tx.amount), 0),
		).toBe(-100);
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
