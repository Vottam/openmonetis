import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import {
	institutions,
	loanInstallments,
	loanOperations,
	loanPayments,
	user,
} from "@/db/schema";
import { db } from "@/shared/lib/db";
import {
	createInstallmentAction,
	createLoanInstitutionAction,
	createLoanOperationAction,
	deleteLoanInstitutionAction,
	recordPaymentAction,
	updateLoanOperationAction,
} from "./actions";
import { seedLoanTestData } from "./lib/test-support";
import { fetchInstitutionsForUser } from "./queries";

function baseOperationInput(institutionId: string) {
	return {
		institutionId,
		loanType: "revolving" as const,
		principalBorrowed: 7000,
		amountReceived: 7000,
		totalContracted: 10000,
		totalInterest: 0,
		totalCharge: 0,
		totalPayable: 7000,
		startDate: new Date("2025-01-01T00:00:00.000Z"),
		endDate: null,
		nextDueDate: new Date("2025-02-01T00:00:00.000Z"),
		currentInstallment: 1,
		totalInstallments: 12,
		status: "active" as const,
	};
}

function assertDefined<T>(value: T | null | undefined, message: string): T {
	if (value === null || value === undefined) {
		throw new Error(message);
	}

	return value;
}

describe("ações de loans", () => {
	beforeEach(async () => {
		await seedLoanTestData();
	});

	it("persiste logo canônico e nome derivado ao cadastrar uma instituição", async () => {
		const { userId } = await seedLoanTestData();

		const result = await createLoanInstitutionAction({
			name: "Nubank",
			type: "bank",
			description: "Conta digital",
			logo: "nubank",
		});

		expect(result.success).toBe(true);

		const institutions = await fetchInstitutionsForUser(userId);
		expect(institutions).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					name: "Nubank",
					logo: "nubank",
					type: "bank",
				}),
			]),
		);
	});

	it("cria operação e parcela com datas e valores persistidos", async () => {
		const { institutionId } = await seedLoanTestData();

		const operationResult = await createLoanOperationAction(
			baseOperationInput(institutionId),
		);
		expect(operationResult.success).toBe(true);
		expect(operationResult.loanOperationId).toBeDefined();
		const loanOperationId = assertDefined(
			operationResult.loanOperationId,
			"loanOperationId ausente",
		);

		const [storedOperation] = await db
			.select()
			.from(loanOperations)
			.where(eq(loanOperations.id, loanOperationId));

		expect(Number(storedOperation.principalBorrowed)).toBe(7000);
		expect(storedOperation.status).toBe("active");

		const installmentResult = await createInstallmentAction({
			loanOperationId,
			installmentNumber: 1,
			dueDate: new Date("2025-02-15T00:00:00.000Z"),
			expectedValue: 1000,
			expectedPrincipal: 800,
			expectedInterest: 200,
			status: "pending",
		});

		expect(installmentResult.success).toBe(true);
		expect(installmentResult.installmentId).toBeDefined();
	});

	it("registra pagamento parcial e quita a parcela na segunda parcela", async () => {
		const { institutionId } = await seedLoanTestData();
		const op = await createLoanOperationAction(
			baseOperationInput(institutionId),
		);
		const loanOperationId = assertDefined(
			op.loanOperationId,
			"loanOperationId ausente",
		);
		const installment = await createInstallmentAction({
			loanOperationId,
			installmentNumber: 1,
			dueDate: new Date("2025-02-15T00:00:00.000Z"),
			expectedValue: 1000,
			expectedPrincipal: 800,
			expectedInterest: 200,
			status: "pending",
		});

		const partial = await recordPaymentAction({
			installmentId: installment.installmentId,
			amount: 400,
			principalPaid: 300,
			interestPaid: 100,
			chargePaid: 0,
			paidAt: new Date("2025-02-10T00:00:00.000Z"),
			status: "partial",
		});

		expect(partial.success).toBe(true);

		const [partialInstallment] = await db
			.select()
			.from(loanInstallments)
			.where(
				eq(
					loanInstallments.id,
					assertDefined(installment.installmentId, "installmentId ausente"),
				),
			);

		expect(Number(partialInstallment.paidAmount)).toBe(400);
		expect(partialInstallment.status).toBe("partial");

		const final = await recordPaymentAction({
			installmentId: installment.installmentId,
			amount: 600,
			principalPaid: 500,
			interestPaid: 100,
			chargePaid: 0,
			paidAt: new Date("2025-02-15T00:00:00.000Z"),
			status: "paid",
		});

		expect(final.success).toBe(true);

		const [finalInstallment] = await db
			.select()
			.from(loanInstallments)
			.where(
				eq(
					loanInstallments.id,
					assertDefined(installment.installmentId, "installmentId ausente"),
				),
			);

		expect(Number(finalInstallment.paidAmount)).toBe(1000);
		expect(finalInstallment.status).toBe("paid");

		const [payment] = await db
			.select()
			.from(loanPayments)
			.where(
				eq(
					loanPayments.installmentId,
					assertDefined(installment.installmentId, "installmentId ausente"),
				),
			);

		expect(payment).toBeDefined();
		expect(Number(payment.amount)).toBe(400);
	});

	it("reconcilia pagamento integral com os componentes exatos da parcela", async () => {
		const { institutionId } = await seedLoanTestData();
		const op = await createLoanOperationAction(
			baseOperationInput(institutionId),
		);
		const loanOperationId = assertDefined(
			op.loanOperationId,
			"loanOperationId ausente",
		);
		const installment = await createInstallmentAction({
			loanOperationId,
			installmentNumber: 1,
			dueDate: new Date("2025-02-15T00:00:00.000Z"),
			expectedValue: 250,
			expectedPrincipal: 166.67,
			expectedInterest: 83.33,
			status: "pending",
		});

		const payment = await recordPaymentAction({
			installmentId: assertDefined(
				installment.installmentId,
				"installmentId ausente",
			),
			amount: 250,
			principalPaid: 166.66,
			interestPaid: 83.33,
			chargePaid: 0,
			paidAt: new Date("2025-02-15T00:00:00.000Z"),
			status: "paid",
		});

		expect(payment.success).toBe(true);

		const [storedPayment] = await db
			.select()
			.from(loanPayments)
			.where(
				eq(
					loanPayments.installmentId,
					assertDefined(installment.installmentId, "installmentId ausente"),
				),
			);

		expect(Number(storedPayment.amount)).toBe(250);
		expect(Number(storedPayment.principalPaid)).toBe(166.67);
		expect(Number(storedPayment.interestPaid)).toBe(83.33);
		expect(Number(storedPayment.chargePaid)).toBe(0);
		expect(
			Math.round(
				(Number(storedPayment.principalPaid) +
					Number(storedPayment.interestPaid) +
					Number(storedPayment.chargePaid)) *
					100,
			),
		).toBe(25000);
	});

	it("permite alterar o limite sem alterar o principal já aberto", async () => {
		const { institutionId } = await seedLoanTestData();
		const op = await createLoanOperationAction(
			baseOperationInput(institutionId),
		);
		const loanOperationId = assertDefined(
			op.loanOperationId,
			"loanOperationId ausente",
		);

		const result = await updateLoanOperationAction({
			id: loanOperationId,
			...baseOperationInput(institutionId),
			totalContracted: 5000,
			totalPayable: 7000,
		});

		expect(result.success).toBe(true);

		const [stored] = await db
			.select()
			.from(loanOperations)
			.where(eq(loanOperations.id, loanOperationId));

		expect(Number(stored.principalBorrowed)).toBe(7000);
		expect(Number(stored.totalContracted)).toBe(5000);
	});

	it("remove uma instituição vazia com segurança", async () => {
		const { userId } = await seedLoanTestData();

		const created = await createLoanInstitutionAction({
			name: "Banco sem dados",
			type: "bank",
			description: "",
			logo: "",
		});

		expect(created.success).toBe(true);
		const institutionId = assertDefined(
			created.institutionId,
			"institutionId ausente",
		);

		const deleted = await deleteLoanInstitutionAction({ id: institutionId });
		expect(deleted.success).toBe(true);

		const remainingInstitutions = await fetchInstitutionsForUser(userId);
		expect(
			remainingInstitutions.some((item) => item.id === institutionId),
		).toBe(false);
	});

	it("remove instituição com operação, parcelas e pagamentos sem deixar órfãos", async () => {
		const { userId, institutionId } = await seedLoanTestData();

		const sibling = await createLoanInstitutionAction({
			name: "Banco vizinho",
			type: "bank",
			description: "",
			logo: "",
		});
		expect(sibling.success).toBe(true);
		const siblingInstitutionId = assertDefined(
			sibling.institutionId,
			"institutionId ausente",
		);

		const operation = await createLoanOperationAction(
			baseOperationInput(institutionId),
		);
		expect(operation.success).toBe(true);
		const loanOperationId = assertDefined(
			operation.loanOperationId,
			"loanOperationId ausente",
		);

		const installment = await createInstallmentAction({
			loanOperationId,
			installmentNumber: 1,
			dueDate: new Date("2025-02-15T00:00:00.000Z"),
			expectedValue: 1000,
			expectedPrincipal: 800,
			expectedInterest: 200,
			status: "pending",
		});
		expect(installment.success).toBe(true);

		const payment = await recordPaymentAction({
			installmentId: assertDefined(
				installment.installmentId,
				"installmentId ausente",
			),
			amount: 1000,
			principalPaid: 800,
			interestPaid: 200,
			chargePaid: 0,
			paidAt: new Date("2025-02-15T00:00:00.000Z"),
			status: "paid",
		});
		expect(payment.success).toBe(true);

		const deleted = await deleteLoanInstitutionAction({ id: institutionId });
		expect(deleted.success).toBe(true);

		const [remainingOperations, remainingInstallments, remainingPayments] =
			await Promise.all([
				db
					.select({ id: loanOperations.id })
					.from(loanOperations)
					.where(eq(loanOperations.institutionId, institutionId)),
				db
					.select({ id: loanInstallments.id })
					.from(loanInstallments)
					.where(eq(loanInstallments.loanOperationId, loanOperationId)),
				db
					.select({ id: loanPayments.id })
					.from(loanPayments)
					.where(eq(loanPayments.loanOperationId, loanOperationId)),
			]);

		expect(remainingOperations).toHaveLength(0);
		expect(remainingInstallments).toHaveLength(0);
		expect(remainingPayments).toHaveLength(0);

		const remainingInstitutions = await fetchInstitutionsForUser(userId);
		expect(
			remainingInstitutions.some((item) => item.id === institutionId),
		).toBe(false);
		expect(
			remainingInstitutions.some((item) => item.id === siblingInstitutionId),
		).toBe(true);
	});

	it("impede que um usuário remova instituição de outro usuário", async () => {
		const foreignUserId = `loan-foreign-user-${randomUUID()}`;
		const foreignInstitutionId = `loan-foreign-institution-${randomUUID()}`;

		await db.insert(user).values({
			id: foreignUserId,
			name: "Outro usuário",
			email: `foreign-${randomUUID()}@example.com`,
			emailVerified: true,
			image: null,
			createdAt: new Date("2025-01-01T00:00:00.000Z"),
			updatedAt: new Date("2025-01-01T00:00:00.000Z"),
		});

		await db.insert(institutions).values({
			id: foreignInstitutionId,
			name: "Banco de outro usuário",
			type: "bank",
			description: null,
			logo: null,
			userId: foreignUserId,
			createdAt: new Date("2025-01-01T00:00:00.000Z"),
			updatedAt: new Date("2025-01-01T00:00:00.000Z"),
		});

		const result = await deleteLoanInstitutionAction({
			id: foreignInstitutionId,
		});
		expect(result.success).toBe(false);

		const [foreignInstitution] = await db
			.select({ id: institutions.id })
			.from(institutions)
			.where(eq(institutions.id, foreignInstitutionId));

		expect(foreignInstitution).toBeDefined();
	});
});
