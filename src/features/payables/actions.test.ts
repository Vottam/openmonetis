import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";

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
	informOccurrenceAmountAction,
	updatePayableAction,
	updatePayableOccurrenceAction,
} from "./actions";
import { ensurePayableOccurrenceHorizon, fetchPayablesPageData } from "./queries";
import { buildPayableOccurrencePeriodRange } from "./lib/horizon";
import { computeMonthlySummary } from "./lib/monthly-read-model";
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

	it("materializa o contrato inteiro quando endsAt existe", async () => {
		const localSeed = await seedPayablesTestData();
		const created = await createPayableAction({
			description: "Aluguel Apartamento",
			supplierName: "Imobiliária",
			categoryId: localSeed.categoryId,
			recurrenceType: "monthly_fixed",
			defaultAmount: 2500,
			startsAt: "2026-08-10",
			endsAt: "2029-08-10",
		});
		assertSuccess(created);

		const occurrences = await db.query.accountsPayableOccurrences.findMany({
			columns: { period: true },
			where: (table, { eq }) => eq(table.payableId, created.data.payableId),
		});
		const expectedPeriods = buildPayableOccurrencePeriodRange(
			{
				recurrenceType: "monthly_fixed",
				startsAt: "2026-08-10",
				endsAt: "2029-08-10",
			},
			"2026-08",
		);

		expect(occurrences.map((item) => item.period).sort()).toEqual(expectedPeriods);
		expect(occurrences.length).toBe(expectedPeriods.length);
		expect(expectedPeriods[0]).toBe("2026-08");
		expect(expectedPeriods.at(-1)).toBe("2029-08");
	});


	it("reconcilia o horizonte ao adicionar e estender endsAt", async () => {
		const localSeed = await seedPayablesTestData();
		const created = await createPayableAction({
			description: "Contrato flexível",
			supplierName: "Locador",
			categoryId: localSeed.categoryId,
			recurrenceType: "monthly_fixed",
			defaultAmount: 2500,
			startsAt: "2026-08-10",
			endsAt: null,
		});
		assertSuccess(created);

		const initialOccurrences = await db.query.accountsPayableOccurrences.findMany({
			columns: { period: true },
			where: (table, { eq }) => eq(table.payableId, created.data.payableId),
		});
		expect(initialOccurrences).toHaveLength(6);

		const firstUpdate = await updatePayableAction({
			id: created.data.payableId,
			description: "Contrato flexível",
			supplierName: "Locador",
			categoryId: localSeed.categoryId,
			recurrenceType: "monthly_fixed",
			defaultAmount: 2500,
			startsAt: "2026-08-10",
			endsAt: "2027-08-10",
		});
		assertSuccess(firstUpdate);

		const afterFirstUpdate = await db.query.accountsPayableOccurrences.findMany({
			columns: { period: true },
			where: (table, { eq }) => eq(table.payableId, created.data.payableId),
		});
		const firstExpectedPeriods = buildPayableOccurrencePeriodRange(
			{
				recurrenceType: "monthly_fixed",
				startsAt: "2026-08-10",
				endsAt: "2027-08-10",
			},
			"2026-08",
		);
		expect(afterFirstUpdate.map((item) => item.period).sort()).toEqual(firstExpectedPeriods);

		const extensionUpdate = await updatePayableAction({
			id: created.data.payableId,
			description: "Contrato flexível",
			supplierName: "Locador",
			categoryId: localSeed.categoryId,
			recurrenceType: "monthly_fixed",
			defaultAmount: 2500,
			startsAt: "2026-08-10",
			endsAt: "2029-08-10",
		});
		assertSuccess(extensionUpdate);

		const afterExtension = await db.query.accountsPayableOccurrences.findMany({
			columns: { period: true },
			where: (table, { eq }) => eq(table.payableId, created.data.payableId),
		});
		const extendedExpectedPeriods = buildPayableOccurrencePeriodRange(
			{
				recurrenceType: "monthly_fixed",
				startsAt: "2026-08-10",
				endsAt: "2029-08-10",
			},
			"2026-08",
		);
		expect(afterExtension.map((item) => item.period).sort()).toEqual(
			extendedExpectedPeriods,
		);
		expect(new Set(afterExtension.map((item) => item.period)).size).toBe(afterExtension.length);

		const idempotentUpdate = await updatePayableAction({
			id: created.data.payableId,
			description: "Contrato flexível",
			supplierName: "Locador",
			categoryId: localSeed.categoryId,
			recurrenceType: "monthly_fixed",
			defaultAmount: 2500,
			startsAt: "2026-08-10",
			endsAt: "2029-08-10",
		});
		assertSuccess(idempotentUpdate);

		const afterIdempotentUpdate = await db.query.accountsPayableOccurrences.findMany({
			columns: { period: true },
			where: (table, { eq }) => eq(table.payableId, created.data.payableId),
		});
		expect(afterIdempotentUpdate.map((item) => item.period).sort()).toEqual(
			extendedExpectedPeriods,
		);
	});

	it("desativa e reativa sem apagar histórico nem duplicar ocorrências", async () => {
		const localSeed = await seedPayablesTestData();
		const created = await createPayableAction({
			description: "Água",
			supplierName: "Saneamento",
			categoryId: localSeed.categoryId,
			recurrenceType: "monthly_fixed",
			defaultAmount: 80,
			startsAt: "2026-08-10",
			endsAt: null,
		});
		assertSuccess(created);

		const beforeOccurrences = await db.query.accountsPayableOccurrences.findMany({
			columns: { id: true },
			where: (table, { eq }) => eq(table.payableId, created.data.payableId),
		});
		expect(beforeOccurrences.length).toBeGreaterThan(0);

		const payment = await createPayablePaymentAction({
			occurrenceId: beforeOccurrences[0]?.id ?? "",
			amount: 80,
			paymentMethod: "Pix",
			accountId: localSeed.accountId,
			cardId: null,
			paidAt: "2026-08-12",
			idempotencyKey: randomUUID(),
		});
		assertSuccess(payment);

		const paymentsBefore = await db.query.accountsPayablePayments.findMany({
			columns: { id: true },
			where: (table, { eq }) => eq(table.occurrenceId, beforeOccurrences[0]?.id ?? ""),
		});

		const deactivated = await cancelPayableAction({ id: created.data.payableId });
		expect(deactivated.success).toBe(true);

		const templateAfterDeactivate = await db.query.accountsPayable.findFirst({
			columns: { status: true, deactivatedAt: true },
			where: (table, { eq }) => eq(table.id, created.data.payableId),
		});
		expect(templateAfterDeactivate?.status).toBe("cancelled");
		expect(templateAfterDeactivate?.deactivatedAt).not.toBeNull();

		const afterDeactivateOccurrences = await db.query.accountsPayableOccurrences.findMany({
			columns: { id: true },
			where: (table, { eq }) => eq(table.payableId, created.data.payableId),
		});
		expect(afterDeactivateOccurrences.map((item) => item.id).sort()).toEqual(
			beforeOccurrences.map((item) => item.id).sort(),
		);

		expect(await ensurePayableOccurrenceHorizon(localSeed.userId)).toBe(0);

		const reactivated = await cancelPayableAction({ id: created.data.payableId });
		expect(reactivated.success).toBe(true);

		const templateAfterActivate = await db.query.accountsPayable.findFirst({
			columns: { status: true, deactivatedAt: true },
			where: (table, { eq }) => eq(table.id, created.data.payableId),
		});
		expect(templateAfterActivate?.status).toBe("active");
		expect(templateAfterActivate?.deactivatedAt).toBe(templateAfterDeactivate?.deactivatedAt);

		expect(await ensurePayableOccurrenceHorizon(localSeed.userId)).toBe(0);

		const afterActivateOccurrences = await db.query.accountsPayableOccurrences.findMany({
			columns: { id: true },
			where: (table, { eq }) => eq(table.payableId, created.data.payableId),
		});
		expect(afterActivateOccurrences.map((item) => item.id).sort()).toEqual(
			beforeOccurrences.map((item) => item.id).sort(),
		);

		const paymentsAfter = await db.query.accountsPayablePayments.findMany({
			columns: { id: true },
			where: (table, { eq }) => eq(table.occurrenceId, beforeOccurrences[0]?.id ?? ""),
		});
		expect(paymentsAfter.length).toBe(paymentsBefore.length);
	});

	it("bloqueia queda do valor abaixo do que já foi pago e preserva a transação", async () => {
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
			columns: { id: true, dueDate: true, expectedAmount: true, actualAmount: true, status: true },
			where: (table, { eq }) => eq(table.payableId, payable.data.payableId),
		});
		expect(occurrence).toBeTruthy();
		if (!occurrence) throw new Error("Occurrence not found");

		const payment = await createPayablePaymentAction({
			occurrenceId: occurrence.id,
			amount: 50,
			paymentMethod: "Pix",
			accountId: localSeed.accountId,
			cardId: null,
			paidAt: "2026-08-12",
			idempotencyKey: randomUUID(),
		});
		assertSuccess(payment);

		const blocked = await updatePayableOccurrenceAction({
			occurrenceId: occurrence.id,
			dueDate: occurrence.dueDate,
			actualAmount: 40,
		});
		expect(blocked.success).toBe(false);
		if (blocked.success) throw new Error("Expected blocked edit to fail");
		expect(blocked.error).toBe("O novo valor não pode ser menor que o valor já pago.");

		const refreshed = await db.query.accountsPayableOccurrences.findFirst({
			columns: { actualAmount: true, status: true },
			with: {
				payments: { columns: { amount: true } },
			},
			where: (table, { eq }) => eq(table.id, occurrence.id),
		});
		expect(refreshed?.actualAmount).toBeNull();
		expect((refreshed?.payments ?? []).reduce((sum, item) => sum + Number(item.amount), 0)).toBe(50);

		const paid = await createPayablePaymentAction({
			occurrenceId: occurrence.id,
			amount: 50,
			paymentMethod: "Pix",
			accountId: localSeed.accountId,
			cardId: null,
			paidAt: "2026-08-12",
			idempotencyKey: randomUUID(),
		});
		assertSuccess(paid);

		const locked = await updatePayableOccurrenceAction({
			occurrenceId: occurrence.id,
			dueDate: occurrence.dueDate,
			actualAmount: 120,
		});
		expect(locked.success).toBe(false);
		if (locked.success) throw new Error("Expected locked edit to fail");
		expect(locked.error).toBe("Não é possível alterar o valor financeiro de uma ocorrência paga.");
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

	it("bloqueia pagamento acima do saldo restante", async () => {
		const localSeed = await seedPayablesTestData();
		const payable = await createPayableAction({
			description: "Conta overpayment",
			supplierName: "Fornecedor overpayment",
			categoryId: localSeed.categoryId,
			recurrenceType: "monthly_fixed",
			defaultAmount: 100,
			startsAt: "2026-08-10",
			endsAt: null,
		});
		assertSuccess(payable);

		const occurrence = await db.query.accountsPayableOccurrences.findFirst({
			columns: { id: true, dueDate: true, expectedAmount: true, actualAmount: true, status: true },
			where: (table, { eq }) => eq(table.payableId, payable.data.payableId),
		});
		expect(occurrence).toBeTruthy();
		if (!occurrence) throw new Error("Occurrence not found");

		const overpayment = await createPayablePaymentAction({
			occurrenceId: occurrence.id,
			amount: 101,
			paymentMethod: "Pix",
			accountId: localSeed.accountId,
			cardId: null,
			paidAt: "2026-08-12",
			idempotencyKey: randomUUID(),
		});

		expect(overpayment.success).toBe(false);
		if (overpayment.success) throw new Error("Expected overpayment to fail");
		expect(overpayment.error).toBe("Valor maior que o saldo restante.");
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
		expect(afterFirst?.actualAmount).toBeNull();
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
		expect(afterSecond?.actualAmount).toBeNull();
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

	it("monthly_variable COM defaultAmount: estimated -> real value -> payment (full flow)", async () => {
		const localSeed = await seedPayablesTestData();

		// STEP 1: Create monthly_variable WITH defaultAmount (estimated 150.00)
		const createResult = await createPayableAction({
			description: "TEST: Energia com estimativa 150",
			supplierName: "Energia Teste",
			categoryId: localSeed.categoryId,
			recurrenceType: "monthly_variable",
			defaultAmount: 150.00,
			startsAt: "2026-08-15",
			endsAt: null,
		});
		assertSuccess(createResult);
		const payableId = createResult.data.payableId;

		// Get the occurrence
		const occBefore = await db.query.accountsPayableOccurrences.findFirst({
			columns: { id: true, expectedAmount: true, actualAmount: true, status: true, paidAmount: true },
			where: (table, { eq }) => eq(table.payableId, payableId),
		});
		expect(occBefore).toBeTruthy();
		if (!occBefore) throw new Error("Occurrence not found");

		// Verify INITIAL state: expectedAmount=150, actualAmount=null, status=pending
		expect(Number(occBefore?.expectedAmount ?? 0)).toBe(150);
		expect(occBefore?.actualAmount).toBeNull();
		expect(occBefore?.status).toBe("pending");

		// STEP 2: Update estimated value to REAL amount (163.42)
		const updateResult = await informOccurrenceAmountAction({
			occurrenceId: occBefore.id,
			amount: 163.42,
		});
		assertSuccess(updateResult);

		// Verify PERSISTED state after informOccurrenceAmountAction
		const occAfterUpdate = await db.query.accountsPayableOccurrences.findFirst({
			columns: { id: true, expectedAmount: true, actualAmount: true, status: true },
			where: (table, { eq }) => eq(table.id, occBefore.id),
		});
		expect(occAfterUpdate).toBeTruthy();

		// FIXED: informOccurrenceAmountAction now writes real value to actualAmount, preserves expectedAmount
		expect(Number(occAfterUpdate?.expectedAmount ?? 0)).toBe(150.00); // expectedAmount preserved (original estimate)
		expect(Number(occAfterUpdate?.actualAmount ?? 0)).toBe(163.42); // actualAmount set to real value
		expect(occAfterUpdate?.status).toBe("pending");

		// STEP 3: Verify read model (monthly-read-model) uses real value
		const pageData = await fetchPayablesPageData(localSeed.userId);
		const testPayable = pageData.payables.find(p => p.payable.id === payableId);
		const occReadModel = testPayable?.occurrences[0];

		expect(occReadModel).toBeTruthy();
		expect(occReadModel?.expectedAmount).toBe(150.00);
		expect(occReadModel?.actualAmount).toBe(163.42);
		expect(occReadModel?.remainingAmount).toBe(163.42); // dueAmount = actualAmount when present

		// Summary from monthly-read-model includes ALL horizon occurrences
		// Current period: actualAmount=163.42, 5 future periods: expectedAmount=150 each = 750
		// Total: 163.42 + 750 = 913.42
		const monthlySummary = computeMonthlySummary(testPayable!.occurrences);
		expect(monthlySummary.totalKnown).toBe(913.42);
		expect(monthlySummary.remaining).toBe(913.42);
		expect(monthlySummary.paid).toBe(0);

		// STEP 4: Make REAL payment of 163.42 via B1 flow
		const paymentResult = await createPayablePaymentAction({
			occurrenceId: occAfterUpdate!.id,
			amount: 163.42,
			paymentMethod: "Pix",
			accountId: localSeed.accountId,
			cardId: null,
			paidAt: "2026-08-12",
			idempotencyKey: randomUUID(),
		});
		assertSuccess(paymentResult);

		// STEP 5: Verify PERSISTED state after payment
				const occAfterPayment = await db.query.accountsPayableOccurrences.findFirst({
					columns: { id: true, expectedAmount: true, actualAmount: true, status: true },
					with: { payments: { columns: { amount: true } } },
					where: (table, { eq }) => eq(table.id, occBefore.id),
				});
				expect(occAfterPayment).toBeTruthy();
				expect(Number(occAfterPayment?.expectedAmount ?? 0)).toBe(150.00);
				expect(Number(occAfterPayment?.actualAmount ?? 0)).toBe(163.42); // actualAmount PRESERVED (real value confirmed)
				expect(occAfterPayment?.status).toBe("paid");

				// paidAmount is derived from payments
				const paidAmountAfter = (occAfterPayment?.payments ?? []).reduce(
					(sum, p) => sum + Number(p.amount ?? 0), 0
				);
				expect(paidAmountAfter).toBe(163.42);

				// STEP 6: Verify read model after payment
				const pageDataAfterPayment = await fetchPayablesPageData(localSeed.userId);
				const testPayableAfter = pageDataAfterPayment.payables.find(p => p.payable.id === payableId);
				const occAfterPaymentRM = testPayableAfter?.occurrences[0];

				expect(occAfterPaymentRM).toBeTruthy();
				expect(occAfterPaymentRM?.expectedAmount).toBe(150.00);
				expect(occAfterPaymentRM?.actualAmount).toBe(163.42);
				expect(occAfterPaymentRM?.paidAmount).toBe(163.42);
				expect(occAfterPaymentRM?.remainingAmount).toBe(0); // actualAmount - paidAmount = 0
				expect(occAfterPaymentRM?.status).toBe("paid");

		// Use monthly-read-model summary for verification
		const monthlySummaryAfter = computeMonthlySummary(testPayableAfter!.occurrences);
		// After payment: current period paid 163.42, 5 future periods still 150 each = 750
		// totalKnown = 163.42 + 750 = 913.42
		// paid = 163.42
		// remaining = 750 (only future periods)
		expect(monthlySummaryAfter.paid).toBe(163.42);
		expect(monthlySummaryAfter.remaining).toBe(750);
		expect(monthlySummaryAfter.totalKnown).toBe(913.42);
		expect(monthlySummaryAfter.totalKnown).toBe(
			monthlySummaryAfter.paid + monthlySummaryAfter.remaining
		);

		// STEP 7: Verify transaction was created correctly
		const tx = await db.query.transactions.findFirst({
			where: (table, { eq }) => eq(table.id, paymentResult.data.transactionId),
		});
		expect(tx).toBeTruthy();
		expect(tx?.amount).toBe("-163.42"); // Expense is negative
		expect(tx?.name).toContain("Pagamento");
		expect(tx?.paymentMethod).toBe("Pix");
		expect(tx?.note).toContain("AUTO_CONTA_A_PAGAR:");

		// STEP 8: Verify payable payment record
		const pp = await db.query.accountsPayablePayments.findFirst({
			where: (table, { eq }) => eq(table.id, paymentResult.data.paymentId),
		});
		expect(pp).toBeTruthy();
		expect(pp?.amount).toBe("163.42");
		expect(pp?.transactionId).toBe(paymentResult.data.transactionId);
		expect(pp?.occurrenceId).toBe(occBefore!.id);
	});
});
