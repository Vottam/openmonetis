import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { loanInstallments, loanOperations, loanPayments } from "@/db/schema";
import { db } from "@/shared/lib/db";
import {
	createInstallmentAction,
	createLoanOperationAction,
	recordPaymentAction,
	updateLoanOperationAction,
	updatePaymentStatusAction,
} from "./actions";
import { seedLoanTestData } from "./lib/test-support";

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

	it("atualiza o status de pagamento sem quebrar o registro persistido", async () => {
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
			expectedValue: 500,
			expectedPrincipal: 500,
			expectedInterest: 0,
			status: "pending",
		});

		const payment = await recordPaymentAction({
			installmentId: assertDefined(
				installment.installmentId,
				"installmentId ausente",
			),
			amount: 500,
			principalPaid: 500,
			interestPaid: 0,
			chargePaid: 0,
			paidAt: new Date("2025-02-15T00:00:00.000Z"),
			status: "paid",
		});

		const updated = await updatePaymentStatusAction({
			paymentId: payment.paymentId,
			status: "overdue",
		});

		expect(updated.success).toBe(true);

		const [storedPayment] = await db
			.select()
			.from(loanPayments)
			.where(
				eq(
					loanPayments.id,
					assertDefined(payment.paymentId, "paymentId ausente"),
				),
			);

		expect(storedPayment.status).toBe("overdue");
	});
});
