import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

import { beforeEach, describe, expect, it } from "vitest";
import {
	institutions,
	loanInstallments,
	loanOperations,
	loanPayments,
	payers,
	user,
} from "@/db/schema";
import { db } from "@/shared/lib/db";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import {
	createInstallmentAction,
	createLoanOperationAction,
	deleteLoanInstitutionAction,
	recordPaymentAction,
} from "./actions";
import {
	buildLoanDashboardData,
	buildLoanInstitutionSummaries,
} from "./lib/dashboard";
import { seedLoanTestData } from "./lib/test-support";
import {
	fetchInstitutionsForUser,
	fetchLoanAccountDetails,
	fetchLoanBalance,
	fetchLoanSummaryForUser,
} from "./queries";

type DashboardSource = Parameters<typeof buildLoanDashboardData>[0];

function loanDates() {
	return {
		startDate: "2025-01-01",
		nextDueDate: "2025-02-01",
	};
}

function fixedOperationInput(institutionId: string) {
	return {
		institutionId,
		loanType: "fixed" as const,
		principalBorrowed: 1000,
		amountReceived: 1000,
		totalContracted: 1200,
		totalInterest: 200,
		totalCharge: 0,
		totalPayable: 1200,
		startDate: new Date("2025-01-01T00:00:00.000Z"),
		endDate: null,
		nextDueDate: new Date("2025-02-01T00:00:00.000Z"),
		currentInstallment: 1,
		totalInstallments: 2,
		status: "active" as const,
	};
}

function revolvingZeroBalanceInput(institutionId: string) {
	return {
		institutionId,
		loanType: "revolving" as const,
		principalBorrowed: 1000,
		amountReceived: 1000,
		totalContracted: 3000,
		totalInterest: 0,
		totalCharge: 0,
		totalPayable: 1000,
		startDate: new Date("2025-01-01T00:00:00.000Z"),
		endDate: null,
		nextDueDate: new Date("2025-02-01T00:00:00.000Z"),
		currentInstallment: 1,
		totalInstallments: 1,
		status: "active" as const,
	};
}

function oneCentResidualFixedInput(institutionId: string) {
	return {
		institutionId,
		loanType: "fixed" as const,
		principalBorrowed: 100,
		amountReceived: 100,
		totalContracted: 250.01,
		totalInterest: 150.01,
		totalCharge: 0,
		totalPayable: 250.01,
		startDate: new Date("2025-01-01T00:00:00.000Z"),
		endDate: null,
		nextDueDate: new Date("2025-02-01T00:00:00.000Z"),
		currentInstallment: 1,
		totalInstallments: 1,
		status: "active" as const,
	};
}

async function insertLoanOperation(params: {
	userId: string;
	institutionId: string;
	principalBorrowed: number;
	totalContracted: number;
	totalInterest: number;
	totalCharge: number;
	totalPayable: number;
	loanType?: "revolving" | "fixed";
}) {
	const inserted = await db
		.insert(loanOperations)
		.values({
			institutionId: params.institutionId,
			loanType: params.loanType ?? "revolving",
			principalBorrowed: formatDecimalForDbRequired(params.principalBorrowed),
			amountReceived: formatDecimalForDbRequired(params.principalBorrowed),
			totalContracted: formatDecimalForDbRequired(params.totalContracted),
			totalInterest: formatDecimalForDbRequired(params.totalInterest),
			totalCharge: formatDecimalForDbRequired(params.totalCharge),
			totalPayable: formatDecimalForDbRequired(params.totalPayable),
			startDate: loanDates().startDate,
			endDate: null,
			nextDueDate: loanDates().nextDueDate,
			currentInstallment: 1,
			totalInstallments: 12,
			status: "active",
			userId: params.userId,
		})
		.returning({ id: loanOperations.id });

	return inserted[0].id;
}

describe("consultas financeiras de loans", () => {
	beforeEach(async () => {
		await seedLoanTestData();
	});

	it("exibe instituições no dashboard com logo e fallback", async () => {
		const { userId, institutionId } = await seedLoanTestData();
		const logoInstitutionId = `loan-institution-logo-${randomUUID()}`;

		await db.insert(institutions).values({
			id: logoInstitutionId,
			name: "Nubank",
			type: "bank",
			description: "Conta digital",
			logo: "nubank",
			userId,
		});

		const institutionsForUser = await fetchInstitutionsForUser(userId);
		const loanData = await fetchLoanAccountDetails(userId);
		const dashboard = buildLoanDashboardData({
			institutions: institutionsForUser,
			operations: loanData.operations,
			installments: loanData.installments,
			payments: loanData.payments,
		});
		const summaries = buildLoanInstitutionSummaries(dashboard);

		expect(summaries.map((item) => item.institution.name)).toEqual(
			expect.arrayContaining(["Banco Teste", "Nubank"]),
		);
		expect(
			summaries.find((item) => item.institution.id === logoInstitutionId)
				?.institution.logo,
		).toBe("nubank");
		expect(
			summaries.find((item) => item.institution.id === institutionId)
				?.institution.logo,
		).toBeNull();
	});

	it("exibe total contratado do empréstimo fixo a partir do total devido", async () => {
		const { userId, institutionId } = await seedLoanTestData();

		await insertLoanOperation({
			userId,
			institutionId,
			principalBorrowed: 2000,
			totalContracted: 10000,
			totalInterest: 1000,
			totalCharge: 0,
			totalPayable: 3000,
			loanType: "fixed",
		});

		const institutionsForUser = await fetchInstitutionsForUser(userId);
		const loanData = await fetchLoanAccountDetails(userId, [institutionId]);
		const dashboard = buildLoanDashboardData({
			institutions: institutionsForUser,
			operations: loanData.operations,
			installments: loanData.installments,
			payments: loanData.payments,
		});

		const account = dashboard.accounts.find(
			(item) =>
				item.institutionId === institutionId && item.loanType === "fixed",
		);

		expect(account).toBeDefined();
		expect(Number(account?.summary.totalContracted)).toBe(3000);
		expect(Number(account?.operations[0].totalContracted)).toBe(3000);
	});

	it("marca empréstimo fixo totalmente quitado como paid no detalhe e no summary", async () => {
		const { userId, institutionId } = await seedLoanTestData();

		const operation = await createLoanOperationAction(
			fixedOperationInput(institutionId),
		);
		expect(operation.success).toBe(true);

		const loanOperationId = operation.loanOperationId;
		expect(loanOperationId).toBeDefined();

		for (const draft of [
			{
				installmentNumber: 1,
				dueDate: new Date("2025-02-15T00:00:00.000Z"),
				expectedValue: 600,
				expectedPrincipal: 500,
				expectedInterest: 100,
			},
			{
				installmentNumber: 2,
				dueDate: new Date("2025-03-15T00:00:00.000Z"),
				expectedValue: 600,
				expectedPrincipal: 500,
				expectedInterest: 100,
			},
		]) {
			const created = await createInstallmentAction({
				loanOperationId: loanOperationId as string,
				installmentNumber: draft.installmentNumber,
				dueDate: draft.dueDate,
				expectedValue: draft.expectedValue,
				expectedPrincipal: draft.expectedPrincipal,
				expectedInterest: draft.expectedInterest,
				status: "pending",
			});
			expect(created.success).toBe(true);
		}

		for (const installmentId of (
			await db
				.select({ id: loanInstallments.id })
				.from(loanInstallments)
				.where(eq(loanInstallments.loanOperationId, loanOperationId as string))
				.orderBy(loanInstallments.installmentNumber)
		).map((row) => row.id)) {
			const payment = await recordPaymentAction({
				installmentId,
				amount: 600,
				principalPaid: 500,
				interestPaid: 100,
				chargePaid: 0,
				paidAt: new Date("2025-02-15T00:00:00.000Z"),
				status: "paid",
			});
			expect(payment.success).toBe(true);
		}

		const institutionsForUser = await fetchInstitutionsForUser(userId);
		const loanData = await fetchLoanAccountDetails(userId, [institutionId]);
		const dashboard = buildLoanDashboardData({
			institutions: institutionsForUser,
			operations: loanData.operations,
			installments: loanData.installments,
			payments: loanData.payments,
		});
		const account = dashboard.accounts.find(
			(item) =>
				item.institutionId === institutionId && item.loanType === "fixed",
		);
		const detailOperation = loanData.operations.find(
			(item) => item.loanType === "fixed",
		);

		const [rawOperation] = await db
			.select({ status: loanOperations.status })
			.from(loanOperations)
			.where(eq(loanOperations.id, loanOperationId as string));

		expect(detailOperation?.status).toBe("paid");
		expect(account?.summary.status).toBe("paid");
		expect(rawOperation?.status).toBe("paid");
		expect(Number(account?.summary.totalPaid)).toBe(1200);
		expect(Number(account?.summary.remainingPrincipal)).toBe(0);
		expect(Number(account?.summary.remainingInterest)).toBe(0);
		expect(Number(account?.summary.paidInstallmentCount)).toBe(2);
	});

	it("mantém o rotativo em aberto mesmo com saldo zero", async () => {
		const { userId, institutionId } = await seedLoanTestData();

		const operation = await createLoanOperationAction(
			revolvingZeroBalanceInput(institutionId),
		);
		expect(operation.success).toBe(true);

		const loanOperationId = operation.loanOperationId;
		expect(loanOperationId).toBeDefined();

		const installment = await createInstallmentAction({
			loanOperationId: loanOperationId as string,
			installmentNumber: 1,
			dueDate: new Date("2025-02-15T00:00:00.000Z"),
			expectedValue: 1000,
			expectedPrincipal: 1000,
			expectedInterest: 0,
			status: "pending",
		});
		expect(installment.success).toBe(true);

		const payment = await recordPaymentAction({
			installmentId: installment.installmentId as string,
			amount: 1000,
			principalPaid: 1000,
			interestPaid: 0,
			chargePaid: 0,
			paidAt: new Date("2025-02-15T00:00:00.000Z"),
			status: "paid",
		});
		expect(payment.success).toBe(true);

		const institutionsForUser = await fetchInstitutionsForUser(userId);
		const loanData = await fetchLoanAccountDetails(userId, [institutionId]);
		const dashboard = buildLoanDashboardData({
			institutions: institutionsForUser,
			operations: loanData.operations,
			installments: loanData.installments,
			payments: loanData.payments,
		});
		const account = dashboard.accounts.find(
			(item) =>
				item.institutionId === institutionId && item.loanType === "revolving",
		);
		const detailOperation = loanData.operations.find(
			(item) => item.loanType === "revolving",
		);

		const [rawOperation] = await db
			.select({ status: loanOperations.status })
			.from(loanOperations)
			.where(eq(loanOperations.id, loanOperationId as string));

		expect(detailOperation?.status).toBe("active");
		expect(account?.summary.status).toBe("active");
		expect(rawOperation?.status).toBe("active");
		expect(Number(account?.summary.remainingPrincipal)).toBe(0);
		expect(Number(account?.summary.totalPaid)).toBe(1000);
	});

	it("mantém um centavo residual como ativo, não quitado", async () => {
		const { userId, institutionId } = await seedLoanTestData();

		const operation = await createLoanOperationAction(
			oneCentResidualFixedInput(institutionId),
		);
		expect(operation.success).toBe(true);

		const loanOperationId = operation.loanOperationId;
		expect(loanOperationId).toBeDefined();

		const installment = await createInstallmentAction({
			loanOperationId: loanOperationId as string,
			installmentNumber: 1,
			dueDate: new Date("2025-02-15T00:00:00.000Z"),
			expectedValue: 250.01,
			expectedPrincipal: 100,
			expectedInterest: 150.01,
			status: "pending",
		});
		expect(installment.success).toBe(true);

		const payment = await recordPaymentAction({
			installmentId: installment.installmentId as string,
			amount: 250,
			principalPaid: 100,
			interestPaid: 150,
			chargePaid: 0,
			paidAt: new Date("2025-02-15T00:00:00.000Z"),
			status: "partial",
		});
		expect(payment.success).toBe(true);

		const institutionsForUser = await fetchInstitutionsForUser(userId);
		const loanData = await fetchLoanAccountDetails(userId, [institutionId]);
		const dashboard = buildLoanDashboardData({
			institutions: institutionsForUser,
			operations: loanData.operations,
			installments: loanData.installments,
			payments: loanData.payments,
		});
		const account = dashboard.accounts.find(
			(item) =>
				item.institutionId === institutionId && item.loanType === "fixed",
		);
		const detailOperation = loanData.operations.find(
			(item) => item.loanType === "fixed",
		);

		expect(detailOperation?.status).toBe("active");
		expect(account?.summary.status).toBe("active");
		expect(Number(account?.summary.totalPaid)).toBe(250);
		expect(
			Math.round(
				(Number(account?.summary.totalPayable ?? 0) -
					Number(account?.summary.totalPaid ?? 0)) *
					100,
			),
		).toBe(1);
	});

	it("mantém o limite disponível do rotativo e ignora juros na recomposição do limite", async () => {
		const { userId, institutionId } = await seedLoanTestData();

		await insertLoanOperation({
			userId,
			institutionId,
			principalBorrowed: 2000,
			totalContracted: 10000,
			totalInterest: 50,
			totalCharge: 0,
			totalPayable: 2050,
			loanType: "revolving",
		});

		const balance = await fetchLoanBalance(userId, institutionId);

		expect(balance).not.toBeNull();
		expect(Number(balance?.limit)).toBe(10000);
		expect(Number(balance?.utilized)).toBe(2000);
		expect(Number(balance?.available)).toBe(8000);
		expect(Number(balance?.remainingInterest)).toBe(50);
	});

	it("agrega múltiplas operações do mesmo rotativo sem reutilizar juros", async () => {
		const { userId, institutionId } = await seedLoanTestData();

		await insertLoanOperation({
			userId,
			institutionId,
			principalBorrowed: 1500,
			totalContracted: 5000,
			totalInterest: 0,
			totalCharge: 0,
			totalPayable: 1500,
			loanType: "revolving",
		});

		await insertLoanOperation({
			userId,
			institutionId,
			principalBorrowed: 2000,
			totalContracted: 5000,
			totalInterest: 0,
			totalCharge: 0,
			totalPayable: 2000,
			loanType: "revolving",
		});

		const balance = await fetchLoanBalance(userId, institutionId);

		expect(balance).not.toBeNull();
		expect(Number(balance?.limit)).toBe(10000);
		expect(Number(balance?.utilized)).toBe(3500);
		expect(Number(balance?.available)).toBe(6500);
		expect(Number(balance?.activeOperations)).toBe(2);
	});

	it("mantém isolamento entre usuários", async () => {
		const { userId: userA, institutionId: institutionA } =
			await seedLoanTestData();
		const suffix = randomUUID();
		const userB = `loan-test-user-b-${suffix}`;
		const institutionB = `loan-institution-test-b-${suffix}`;
		const payerB = randomUUID();

		await db.insert(user).values({
			id: userB,
			name: "Loan Test User B",
			email: `loan-test-b-${suffix}@example.com`,
			emailVerified: true,
			image: null,
			createdAt: new Date("2025-01-01T00:00:00.000Z"),
			updatedAt: new Date("2025-01-01T00:00:00.000Z"),
		});

		await db.insert(payers).values({
			id: payerB,
			name: "Pessoa B",
			email: null,
			avatarUrl: null,
			status: "active",
			note: null,
			role: "admin",
			isAutoSend: false,
			shareCode: `loan-test-share-code-b-${suffix}`,
			lastMailAt: null,
			userId: userB,
		});

		await db.insert(institutions).values({
			id: institutionB,
			name: "Banco Teste B",
			type: "bank",
			description: null,
			logo: null,
			userId: userB,
		});

		await insertLoanOperation({
			userId: userA,
			institutionId: institutionA,
			principalBorrowed: 1000,
			totalContracted: 1000,
			totalInterest: 0,
			totalCharge: 0,
			totalPayable: 1000,
			loanType: "revolving",
		});

		await db.insert(loanOperations).values({
			institutionId: institutionB,
			loanType: "revolving",
			principalBorrowed: formatDecimalForDbRequired(4000),
			amountReceived: formatDecimalForDbRequired(4000),
			totalContracted: formatDecimalForDbRequired(4000),
			totalInterest: formatDecimalForDbRequired(0),
			totalCharge: formatDecimalForDbRequired(0),
			totalPayable: formatDecimalForDbRequired(4000),
			startDate: "2025-01-01",
			endDate: null,
			nextDueDate: "2025-02-01",
			currentInstallment: 1,
			totalInstallments: 12,
			status: "active",
			userId: userB,
		});

		const summaryA = await fetchLoanSummaryForUser(userA);
		const balanceA = await fetchLoanBalance(userA, institutionA);

		expect(summaryA).toHaveLength(1);
		expect(Number(balanceA?.available)).toBe(0);
		expect(Number(balanceA?.utilized)).toBe(1000);
	});

	it("preserva precisão monetária em centavos", async () => {
		const { userId, institutionId } = await seedLoanTestData();

		await insertLoanOperation({
			userId,
			institutionId,
			principalBorrowed: 1234.56,
			totalContracted: 2000.1,
			totalInterest: 12.34,
			totalCharge: 0.56,
			totalPayable: 1247.46,
			loanType: "revolving",
		});

		const balance = await fetchLoanBalance(userId, institutionId);

		expect(Number(balance?.limit)).toBeCloseTo(2000.1, 2);
		expect(Number(balance?.utilized)).toBeCloseTo(1234.56, 2);
		expect(Number(balance?.available)).toBeCloseTo(765.54, 2);
	});

	it("atualiza o dashboard depois da exclusão e preserva outras instituições", async () => {
		const { userId, institutionId } = await seedLoanTestData();
		const sibling = await db
			.insert(institutions)
			.values({
				id: `loan-sibling-${randomUUID()}`,
				name: "Banco irmão",
				type: "bank",
				description: null,
				logo: null,
				userId,
			})
			.returning({ id: institutions.id });
		const siblingInstitutionId = sibling[0]?.id;

		if (!siblingInstitutionId) {
			throw new Error("siblingInstitutionId ausente");
		}

		const deletedOperation = await createLoanOperationAction(
			fixedOperationInput(institutionId),
		);
		expect(deletedOperation.success).toBe(true);

		const siblingOperation = await createLoanOperationAction(
			fixedOperationInput(siblingInstitutionId),
		);
		expect(siblingOperation.success).toBe(true);

		const deleted = await deleteLoanInstitutionAction({ id: institutionId });
		expect(deleted.success).toBe(true);

		const [
			sourceInstitutions,
			sourceOperations,
			sourceInstallments,
			sourcePayments,
		] = await Promise.all([
			db.select().from(institutions),
			db.select().from(loanOperations),
			db.select().from(loanInstallments),
			db.select().from(loanPayments),
		]);

		const serializeRow = <T>(row: T) =>
			JSON.parse(JSON.stringify(row)) as unknown;
		const dashboard = buildLoanDashboardData({
			institutions: sourceInstitutions.map(
				serializeRow,
			) as DashboardSource["institutions"],
			operations: sourceOperations.map(
				serializeRow,
			) as DashboardSource["operations"],
			installments: sourceInstallments.map(
				serializeRow,
			) as DashboardSource["installments"],
			payments: sourcePayments.map(serializeRow) as DashboardSource["payments"],
		});

		expect(
			dashboard.institutions.some((item) => item.id === institutionId),
		).toBe(false);
		expect(
			dashboard.institutions.some((item) => item.id === siblingInstitutionId),
		).toBe(true);
		expect(
			dashboard.accounts.some(
				(account) => account.institutionId === siblingInstitutionId,
			),
		).toBe(true);
	});
});
