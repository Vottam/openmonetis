import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import {
	institutions,
	loanInstallments,
	loanOperations,
	loanPayments,
} from "@/db/schema";
import { db } from "@/shared/lib/db";
import type {
	Installment,
	LoanInstitution,
	LoanOperation,
	LoanStatus,
	LoanSummary,
	LoanType,
	Payment,
} from "./types";

function toNumber(value: unknown): number {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}

function toDateString(value: unknown): string {
	if (value instanceof Date) {
		return value.toISOString();
	}

	if (typeof value === "string") {
		return value;
	}

	return "";
}

function mapInstitution(row: {
	id: string;
	name: string;
	type: string;
	description: string | null;
	createdAt: Date;
	updatedAt: Date;
}): LoanInstitution {
	return {
		id: row.id,
		name: row.name,
		type: row.type as "bank" | "other",
		description: row.description ?? undefined,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function mapLoanOperation(row: {
	id: string;
	institutionId: string;
	loanType: string;
	principalBorrowed: unknown;
	amountReceived: unknown;
	totalContracted: unknown;
	totalInterest: unknown;
	totalCharge: unknown;
	totalPayable: unknown;
	startDate: string | Date;
	endDate: string | Date | null;
	nextDueDate: string | Date;
	currentInstallment: number;
	totalInstallments: number;
	status: string;
	createdAt: Date;
	updatedAt: Date;
}): LoanOperation {
	return {
		id: row.id,
		loanId: row.id,
		institutionId: row.institutionId,
		loanType: row.loanType as LoanType,
		principalBorrowed: toNumber(row.principalBorrowed),
		amountReceived: toNumber(row.amountReceived),
		totalContracted: toNumber(row.totalContracted),
		totalInterest: toNumber(row.totalInterest),
		totalCharge: toNumber(row.totalCharge),
		totalPayable: toNumber(row.totalPayable),
		startDate: toDateString(row.startDate),
		endDate: row.endDate ? toDateString(row.endDate) : null,
		nextDueDate: toDateString(row.nextDueDate),
		currentInstallment: row.currentInstallment,
		totalInstallments: row.totalInstallments,
		status: row.status as LoanStatus,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function mapInstallment(row: {
	id: string;
	loanOperationId: string;
	installmentNumber: number;
	dueDate: string | Date;
	expectedValue: unknown;
	expectedPrincipal: unknown;
	expectedInterest: unknown;
	paid: boolean;
	paidAmount: unknown;
	paidPrincipal: unknown;
	paidInterest: unknown;
	paidDate: Date | null;
	status: string;
}): Installment {
	return {
		id: row.id,
		loanOperationId: row.loanOperationId,
		installmentNumber: row.installmentNumber,
		dueDate: toDateString(row.dueDate),
		expectedValue: toNumber(row.expectedValue),
		expectedPrincipal: toNumber(row.expectedPrincipal),
		expectedInterest: toNumber(row.expectedInterest),
		paid: row.paid,
		paidAmount: toNumber(row.paidAmount),
		paidPrincipal: toNumber(row.paidPrincipal),
		paidInterest: toNumber(row.paidInterest),
		paidDate: row.paidDate ? row.paidDate.toISOString() : null,
		status: row.status as Installment["status"],
	};
}

function mapPayment(row: {
	id: string;
	loanOperationId: string;
	installmentId: string | null;
	installmentNumber: number;
	amount: unknown;
	principalPaid: unknown;
	interestPaid: unknown;
	chargePaid: unknown;
	paidAt: Date | null;
	status: string;
}): Payment {
	return {
		id: row.id,
		loanOperationId: row.loanOperationId,
		installmentId: row.installmentId ?? "",
		installmentNumber: row.installmentNumber,
		amount: toNumber(row.amount),
		principalPaid: toNumber(row.principalPaid),
		interestPaid: toNumber(row.interestPaid),
		chargePaid: toNumber(row.chargePaid),
		paidAt: row.paidAt ? row.paidAt.toISOString() : "",
		status: row.status as Payment["status"],
	};
}

export async function fetchInstitutionsForUser(userId: string) {
	const rows = await db
		.select({
			id: institutions.id,
			name: institutions.name,
			type: institutions.type,
			description: institutions.description,
			createdAt: institutions.createdAt,
			updatedAt: institutions.updatedAt,
		})
		.from(institutions)
		.where(eq(institutions.userId, userId))
		.orderBy(asc(institutions.name));

	return rows.map(mapInstitution);
}

export async function fetchLoanOperationsByAccountId(
	userId: string,
	accountId: string,
) {
	const rows = await db
		.select({
			id: loanOperations.id,
			institutionId: loanOperations.institutionId,
			loanType: loanOperations.loanType,
			principalBorrowed: loanOperations.principalBorrowed,
			amountReceived: loanOperations.amountReceived,
			totalContracted: loanOperations.totalContracted,
			totalInterest: loanOperations.totalInterest,
			totalCharge: loanOperations.totalCharge,
			totalPayable: loanOperations.totalPayable,
			startDate: loanOperations.startDate,
			endDate: loanOperations.endDate,
			nextDueDate: loanOperations.nextDueDate,
			currentInstallment: loanOperations.currentInstallment,
			totalInstallments: loanOperations.totalInstallments,
			status: loanOperations.status,
			createdAt: loanOperations.createdAt,
			updatedAt: loanOperations.updatedAt,
		})
		.from(loanOperations)
		.where(
			and(
				eq(loanOperations.userId, userId),
				eq(loanOperations.institutionId, accountId),
			),
		)
		.orderBy(asc(loanOperations.createdAt));

	return rows.map(mapLoanOperation);
}

export async function fetchLoanAccountsForUser(
	userId: string,
	accountId?: string,
) {
	const rows = await db
		.select({
			id: loanOperations.id,
			institutionId: loanOperations.institutionId,
			institutionName: institutions.name,
			institutionType: institutions.type,
			description: institutions.description,
			loanType: loanOperations.loanType,
			principalBorrowed: loanOperations.principalBorrowed,
			amountReceived: loanOperations.amountReceived,
			totalContracted: loanOperations.totalContracted,
			totalInterest: loanOperations.totalInterest,
			totalCharge: loanOperations.totalCharge,
			totalPayable: loanOperations.totalPayable,
			startDate: loanOperations.startDate,
			endDate: loanOperations.endDate,
			nextDueDate: loanOperations.nextDueDate,
			currentInstallment: loanOperations.currentInstallment,
			totalInstallments: loanOperations.totalInstallments,
			status: loanOperations.status,
			createdAt: loanOperations.createdAt,
			updatedAt: loanOperations.updatedAt,
		})
		.from(loanOperations)
		.leftJoin(institutions, eq(institutions.id, loanOperations.institutionId))
		.where(
			and(
				eq(loanOperations.userId, userId),
				eq(loanOperations.loanType, "revolving"),
				accountId ? eq(loanOperations.institutionId, accountId) : sql`true`,
			),
		)
		.orderBy(desc(loanOperations.updatedAt));

	return rows.map((row) => ({
		id: row.id,
		institutionId: row.institutionId,
		institutionName: row.institutionName ?? "",
		institutionType: (row.institutionType ?? "other") as "bank" | "other",
		loanType: row.loanType as LoanType,
		principalBorrowed: toNumber(row.principalBorrowed),
		amountReceived: toNumber(row.amountReceived),
		totalContracted: toNumber(row.totalContracted),
		totalInterest: toNumber(row.totalInterest),
		totalCharge: toNumber(row.totalCharge),
		totalPayable: toNumber(row.totalPayable),
		limit: toNumber(row.totalContracted),
		available: toNumber(row.totalContracted) - toNumber(row.principalBorrowed),
		utilized: toNumber(row.principalBorrowed),
		status: row.status as LoanStatus,
		totalInstallments: row.totalInstallments,
		currentInstallment: row.currentInstallment,
		startDate: toDateString(row.startDate),
		endDate: row.endDate ? toDateString(row.endDate) : null,
		nextDueDate: toDateString(row.nextDueDate),
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	}));
}

export async function fetchInstallmentsForLoanOperation(
	userId: string,
	operationId: string,
) {
	const rows = await db
		.select({
			id: loanInstallments.id,
			loanOperationId: loanInstallments.loanOperationId,
			installmentNumber: loanInstallments.installmentNumber,
			dueDate: loanInstallments.dueDate,
			expectedValue: loanInstallments.expectedValue,
			expectedPrincipal: loanInstallments.expectedPrincipal,
			expectedInterest: loanInstallments.expectedInterest,
			paid: loanInstallments.paid,
			paidAmount: loanInstallments.paidAmount,
			paidPrincipal: loanInstallments.paidPrincipal,
			paidInterest: loanInstallments.paidInterest,
			paidDate: loanInstallments.paidDate,
			status: loanInstallments.status,
		})
		.from(loanInstallments)
		.where(
			and(
				eq(loanInstallments.userId, userId),
				eq(loanInstallments.loanOperationId, operationId),
			),
		)
		.orderBy(asc(loanInstallments.installmentNumber));

	return rows.map(mapInstallment);
}

export async function fetchPaymentsForLoanOperation(
	userId: string,
	operationId: string,
) {
	const rows = await db
		.select({
			id: loanPayments.id,
			loanOperationId: loanPayments.loanOperationId,
			installmentId: loanPayments.installmentId,
			installmentNumber: loanPayments.installmentNumber,
			amount: loanPayments.amount,
			principalPaid: loanPayments.principalPaid,
			interestPaid: loanPayments.interestPaid,
			chargePaid: loanPayments.chargePaid,
			paidAt: loanPayments.paidAt,
			status: loanPayments.status,
		})
		.from(loanPayments)
		.where(
			and(
				eq(loanPayments.userId, userId),
				eq(loanPayments.loanOperationId, operationId),
			),
		)
		.orderBy(asc(loanPayments.paidAt));

	return rows.map(mapPayment);
}

export async function fetchLoanBalance(userId: string, accountId?: string) {
	const rows = await db
		.select({
			id: loanOperations.id,
			institutionId: loanOperations.institutionId,
			institutionName: institutions.name,
			institutionType: institutions.type,
			principalBorrowed: loanOperations.principalBorrowed,
			totalContracted: loanOperations.totalContracted,
			totalInterest: loanOperations.totalInterest,
			totalCharge: loanOperations.totalCharge,
			totalPayable: loanOperations.totalPayable,
			status: loanOperations.status,
			totalInstallments: loanOperations.totalInstallments,
			currentInstallment: loanOperations.currentInstallment,
			startDate: loanOperations.startDate,
			endDate: loanOperations.endDate,
			nextDueDate: loanOperations.nextDueDate,
			createdAt: loanOperations.createdAt,
			updatedAt: loanOperations.updatedAt,
		})
		.from(loanOperations)
		.leftJoin(institutions, eq(institutions.id, loanOperations.institutionId))
		.where(
			and(
				eq(loanOperations.userId, userId),
				eq(loanOperations.loanType, "revolving"),
				accountId ? eq(loanOperations.institutionId, accountId) : sql`true`,
			),
		);

	if (!rows.length) {
		return null;
	}

	const utilized = rows.reduce(
		(sum, row) => sum + toNumber(row.principalBorrowed),
		0,
	);
	const limit = rows.reduce(
		(sum, row) => sum + toNumber(row.totalContracted),
		0,
	);
	const totalInterest = rows.reduce(
		(sum, row) => sum + toNumber(row.totalInterest),
		0,
	);
	const totalCharge = rows.reduce(
		(sum, row) => sum + toNumber(row.totalCharge),
		0,
	);
	const totalPayable = rows.reduce(
		(sum, row) => sum + toNumber(row.totalPayable),
		0,
	);
	const remainingPrincipal = limit - utilized;
	const remainingInterest = totalInterest;
	const remainingCharge = totalCharge;
	const latest = rows[0];

	return {
		loanId: latest.id,
		institutionId: latest.institutionId,
		institutionName: latest.institutionName ?? "",
		institutionType: (latest.institutionType ?? "other") as "bank" | "other",
		loanType: "revolving" as LoanType,
		limit,
		available: limit - utilized,
		utilized,
		remainingPrincipal,
		remainingInterest,
		remainingCharge,
		totalPayable,
		status: latest.status as LoanStatus,
		totalInstallments: latest.totalInstallments,
		currentInstallment: latest.currentInstallment,
		startDate: toDateString(latest.startDate),
		endDate: latest.endDate ? toDateString(latest.endDate) : null,
		nextDueDate: toDateString(latest.nextDueDate),
		activeOperations: rows.length,
		nextPayment: rows.length > 0 ? totalPayable / rows.length : 0,
		createdAt: latest.createdAt.toISOString(),
		updatedAt: latest.updatedAt.toISOString(),
	};
}

export async function fetchLoanSummaryForUser(userId: string) {
	const rows = await db
		.select({
			id: loanOperations.id,
			institutionId: loanOperations.institutionId,
			institutionName: institutions.name,
			institutionType: institutions.type,
			description: institutions.description,
			loanType: loanOperations.loanType,
			principalBorrowed: loanOperations.principalBorrowed,
			amountReceived: loanOperations.amountReceived,
			totalContracted: loanOperations.totalContracted,
			totalInterest: loanOperations.totalInterest,
			totalCharge: loanOperations.totalCharge,
			totalPayable: loanOperations.totalPayable,
			status: loanOperations.status,
			totalInstallments: loanOperations.totalInstallments,
			currentInstallment: loanOperations.currentInstallment,
			startDate: loanOperations.startDate,
			endDate: loanOperations.endDate,
			nextDueDate: loanOperations.nextDueDate,
			createdAt: loanOperations.createdAt,
			updatedAt: loanOperations.updatedAt,
		})
		.from(loanOperations)
		.leftJoin(institutions, eq(institutions.id, loanOperations.institutionId))
		.where(
			and(
				eq(loanOperations.userId, userId),
				eq(loanOperations.loanType, "revolving"),
			),
		)
		.orderBy(desc(loanOperations.updatedAt));

	return rows.map((row) => {
		const institution = mapInstitution({
			id: row.institutionId,
			name: row.institutionName ?? "",
			type: row.institutionType ?? "other",
			description: row.description ?? null,
			createdAt: row.createdAt,
			updatedAt: row.updatedAt,
		});

		const utilized = toNumber(row.principalBorrowed);
		const limit = toNumber(row.totalContracted);
		const totalInterest = toNumber(row.totalInterest);
		const totalCharge = toNumber(row.totalCharge);
		const totalPayable = toNumber(row.totalPayable);
		const available = limit - utilized;

		return {
			institution,
			loanType: row.loanType as LoanType,
			limit,
			available,
			utilized,
			totalPayable,
			remainingPrincipal: available,
			remainingInterest: totalInterest,
			remainingCharge: totalCharge,
			installmentCount: row.totalInstallments,
			currentInstallment: row.currentInstallment,
			nextPayment:
				row.totalInstallments > 0 ? totalPayable / row.totalInstallments : 0,
			activeOperations: 1,
			status: row.status as LoanStatus,
			createdAt: row.createdAt.toISOString(),
			updatedAt: row.updatedAt.toISOString(),
		} as LoanSummary;
	});
}

export async function fetchLoanAccountDetails(
	userId: string,
	accountIds: string[] = [],
) {
	const selectedIds = accountIds.length > 0 ? accountIds : undefined;
	const operationsRows = await db
		.select({
			id: loanOperations.id,
			institutionId: loanOperations.institutionId,
			institutionName: institutions.name,
			institutionType: institutions.type,
			description: institutions.description,
			loanType: loanOperations.loanType,
			principalBorrowed: loanOperations.principalBorrowed,
			amountReceived: loanOperations.amountReceived,
			totalContracted: loanOperations.totalContracted,
			totalInterest: loanOperations.totalInterest,
			totalCharge: loanOperations.totalCharge,
			totalPayable: loanOperations.totalPayable,
			status: loanOperations.status,
			totalInstallments: loanOperations.totalInstallments,
			currentInstallment: loanOperations.currentInstallment,
			startDate: loanOperations.startDate,
			endDate: loanOperations.endDate,
			nextDueDate: loanOperations.nextDueDate,
			createdAt: loanOperations.createdAt,
			updatedAt: loanOperations.updatedAt,
		})
		.from(loanOperations)
		.leftJoin(institutions, eq(institutions.id, loanOperations.institutionId))
		.where(
			and(
				eq(loanOperations.userId, userId),
				selectedIds
					? inArray(loanOperations.institutionId, selectedIds)
					: sql`true`,
			),
		)
		.orderBy(asc(loanOperations.updatedAt));

	const installmentsRows = await db
		.select({
			id: loanInstallments.id,
			loanOperationId: loanInstallments.loanOperationId,
			installmentNumber: loanInstallments.installmentNumber,
			dueDate: loanInstallments.dueDate,
			expectedValue: loanInstallments.expectedValue,
			expectedPrincipal: loanInstallments.expectedPrincipal,
			expectedInterest: loanInstallments.expectedInterest,
			paid: loanInstallments.paid,
			paidAmount: loanInstallments.paidAmount,
			paidPrincipal: loanInstallments.paidPrincipal,
			paidInterest: loanInstallments.paidInterest,
			paidDate: loanInstallments.paidDate,
			status: loanInstallments.status,
		})
		.from(loanInstallments)
		.where(
			and(
				eq(loanInstallments.userId, userId),
				selectedIds
					? inArray(
							loanInstallments.loanOperationId,
							operationsRows.map((op) => op.id),
						)
					: sql`true`,
			),
		)
		.orderBy(asc(loanInstallments.installmentNumber));

	const paymentsRows = await db
		.select({
			id: loanPayments.id,
			loanOperationId: loanPayments.loanOperationId,
			installmentId: loanPayments.installmentId,
			installmentNumber: loanPayments.installmentNumber,
			amount: loanPayments.amount,
			principalPaid: loanPayments.principalPaid,
			interestPaid: loanPayments.interestPaid,
			chargePaid: loanPayments.chargePaid,
			paidAt: loanPayments.paidAt,
			status: loanPayments.status,
		})
		.from(loanPayments)
		.where(
			and(
				eq(loanPayments.userId, userId),
				selectedIds
					? inArray(
							loanPayments.loanOperationId,
							operationsRows.map((op) => op.id),
						)
					: sql`true`,
			),
		)
		.orderBy(asc(loanPayments.paidAt));

	return {
		operations: operationsRows.map((row) => mapLoanOperation(row)),
		installments: installmentsRows.map((row) => mapInstallment(row)),
		payments: paymentsRows.map((row) => mapPayment(row)),
	};
}

export async function fetchLoanById(userId: string, loanId: string) {
	const [row] = await db
		.select({
			id: loanOperations.id,
			institutionId: loanOperations.institutionId,
			loanType: loanOperations.loanType,
			principalBorrowed: loanOperations.principalBorrowed,
			amountReceived: loanOperations.amountReceived,
			totalContracted: loanOperations.totalContracted,
			totalInterest: loanOperations.totalInterest,
			totalCharge: loanOperations.totalCharge,
			totalPayable: loanOperations.totalPayable,
			startDate: loanOperations.startDate,
			endDate: loanOperations.endDate,
			nextDueDate: loanOperations.nextDueDate,
			currentInstallment: loanOperations.currentInstallment,
			totalInstallments: loanOperations.totalInstallments,
			status: loanOperations.status,
			createdAt: loanOperations.createdAt,
			updatedAt: loanOperations.updatedAt,
		})
		.from(loanOperations)
		.where(
			and(eq(loanOperations.userId, userId), eq(loanOperations.id, loanId)),
		)
		.limit(1);

	return row ? mapLoanOperation(row) : null;
}
