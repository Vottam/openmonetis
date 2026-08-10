import {
	addMonthsToDate,
	formatDateOnly,
	toDateOnlyString,
} from "@/shared/utils/date";
import type {
	Installment,
	LoanInstitution,
	LoanOperation,
	LoanStatus,
	LoanType,
	Payment,
} from "../types";

export type LoanInstallmentDraft = {
	installmentNumber: number;
	dueDate: Date;
	expectedValue: number;
	expectedPrincipal: number;
	expectedInterest: number;
	expectedCharge: number;
};

export type LoanDashboardSummary = {
	loanType: LoanType;
	status: LoanStatus;
	limit: number;
	available: number;
	utilized: number;
	amountReceived: number;
	totalContracted: number;
	totalPaid: number;
	totalPayable: number;
	remainingPrincipal: number;
	remainingInterest: number;
	remainingCharge: number;
	paidPrincipal: number;
	paidInterest: number;
	paidCharge: number;
	installmentCount: number;
	paidInstallmentCount: number;
	currentInstallment: number;
	activeOperations: number;
	nextDueDate: string | null;
	lastPaymentDate: string | null;
	nextPayment: number;
};

export type LoanDashboardAccount = {
	id: string;
	institutionId: string;
	institution: LoanInstitution;
	institutionName: string;
	loanType: LoanType;
	operations: LoanOperation[];
	installments: Installment[];
	payments: Payment[];
	summary: LoanDashboardSummary;
};

export type LoanDashboardTotals = {
	accounts: number;
	revolvingAccounts: number;
	fixedAccounts: number;
	activeOperations: number;
	totalLimit: number;
	totalAvailable: number;
	totalUtilized: number;
	totalPaid: number;
	totalPayable: number;
	totalDue: number;
	pendingInstallments: number;
	nextDueDate: string | null;
};

export type LoanDashboardData = {
	institutions: LoanInstitution[];
	accounts: LoanDashboardAccount[];
	totals: LoanDashboardTotals;
	defaultAccountId: string | null;
};

type DashboardSourceData = {
	institutions: LoanInstitution[];
	operations: LoanOperation[];
	installments: Installment[];
	payments: Payment[];
};

function toNumber(value: unknown): number {
	const numberValue = Number(value);
	return Number.isFinite(numberValue) ? numberValue : 0;
}

function clampMoney(value: number): number {
	return Math.max(0, Math.round(value * 100) / 100);
}

function sumBy<T>(items: T[], selector: (item: T) => number): number {
	return items.reduce((sum, item) => sum + selector(item), 0);
}

function combineStatus(operations: LoanOperation[]): LoanStatus {
	if (operations.some((operation) => operation.status === "overdue")) {
		return "overdue";
	}

	if (operations.every((operation) => operation.status === "paid")) {
		return "paid";
	}

	if (operations.some((operation) => operation.status === "cancelled")) {
		return "cancelled";
	}

	return "active";
}

function getNextDueDate(
	installments: Installment[],
	operations: LoanOperation[],
): string | null {
	const unpaidInstallments = installments.filter((installment) => {
		if (installment.status === "paid") {
			return false;
		}

		if (installment.status === "partial") {
			return true;
		}

		return true;
	});

	const nextInstallment = unpaidInstallments.sort((left, right) =>
		left.dueDate.localeCompare(right.dueDate),
	)[0];
	if (nextInstallment) {
		return formatDateOnly(nextInstallment.dueDate);
	}

	const nextOperation = [...operations].sort((left, right) =>
		left.nextDueDate.localeCompare(right.nextDueDate),
	)[0];
	return nextOperation ? formatDateOnly(nextOperation.nextDueDate) : null;
}

function getLastPaymentDate(payments: Payment[]): string | null {
	const lastPayment = [...payments]
		.sort((left, right) => left.paidAt.localeCompare(right.paidAt))
		.at(-1);
	return lastPayment ? formatDateOnly(lastPayment.paidAt) : null;
}

function getNextPaymentAmount(installments: Installment[]): number {
	const nextInstallment = [...installments]
		.filter((installment) => installment.status !== "paid")
		.sort((left, right) => left.installmentNumber - right.installmentNumber)[0];

	return nextInstallment ? toNumber(nextInstallment.expectedValue) : 0;
}

export function buildLoanInstallmentPlan(params: {
	principalBorrowed: number;
	totalInterest: number;
	totalCharge: number;
	totalPayable: number;
	totalInstallments: number;
	firstDueDate: Date;
}): LoanInstallmentDraft[] {
	const count = Math.max(1, Math.trunc(params.totalInstallments));

	// 1. Distribuir totalPayable uniformemente em centavos inteiros
	// entre N parcelas (base + resto), garantindo soma exata = totalPayableCents.
	const totalPayableCents = Math.round(params.totalPayable * 100);
	const baseValueCents = Math.floor(totalPayableCents / count);
	const remainderValueCents = totalPayableCents % count;

	// 2. Distribuir principal proporcionalmente aos expectedValue de cada parcela.
	// Usa algoritmo de apportionment cumulativo para garantir soma exata = principalCents.
	const principalCents = Math.round(params.principalBorrowed * 100);
	const chargeCents = Math.round(params.totalCharge * 100);

	// Distribuir expectedValue uniforme (base + resto) entre parcelas
	const expectedValueCents = Array.from(
		{ length: count },
		(_, i) => baseValueCents + (i < remainderValueCents ? 1 : 0),
	);

	// Função auxiliar para distribuir um total proporcionalmente a um vetor de pesos
	function apportion(total: number, weights: number[]): number[] {
		const n = weights.length;
		const sumWeights = weights.reduce((a, b) => a + b, 0);
		if (sumWeights === 0) return Array(n).fill(0);

		const exact: number[] = weights.map((w) => (w * total) / sumWeights);
		const floored: number[] = exact.map((e) => Math.floor(e));
		const allocated = floored.reduce((a, b) => a + b, 0);
		const remainder = total - allocated;

		// Distribuir o resto (+1) para as parcelas com maiores partes fracionárias
		const fractions = exact.map((e, i) => ({ index: i, frac: e - floored[i] }));
		fractions.sort((a, b) => b.frac - a.frac);
		for (let i = 0; i < remainder; i++) {
			floored[fractions[i].index]++;
		}
		return floored;
	}

	// Distribuir principal proporcionalmente aos expectedValue
	const principalSplit = apportion(principalCents, expectedValueCents);

	// Distribuir charge proporcionalmente ao espaço restante
	// (expectedValue - principal, que é exatamente o espaço para charge)
	const chargeCapacity = expectedValueCents.map(
		(ev, i) => ev - principalSplit[i],
	);
	const chargeSplit = apportion(chargeCents, chargeCapacity);

	// Interest é o residual exato: installmentTotal - principal - charge
	const interestSplit = expectedValueCents.map(
		(ev, i) => ev - principalSplit[i] - chargeSplit[i],
	);

	return Array.from({ length: count }, (_, index) => ({
		installmentNumber: index + 1,
		dueDate: addMonthsToDate(params.firstDueDate, index),
		expectedValue: expectedValueCents[index] / 100,
		expectedPrincipal: principalSplit[index] / 100,
		expectedInterest: interestSplit[index] / 100,
		expectedCharge: chargeSplit[index] / 100,
	}));
}

export function buildLoanDashboardData(
	source: DashboardSourceData,
): LoanDashboardData {
	const institutionMap = new Map(
		source.institutions.map((institution) => [institution.id, institution]),
	);

	const groupMap = new Map<
		string,
		{
			institutionId: string;
			institution: LoanInstitution;
			loanType: LoanType;
			operations: LoanOperation[];
			installments: Installment[];
			payments: Payment[];
		}
	>();

	for (const operation of source.operations) {
		const key = `${operation.institutionId}:${operation.loanType}`;
		const institution = institutionMap.get(operation.institutionId) ?? {
			id: operation.institutionId,
			name: operation.institutionId,
			type: "other",
			description: undefined,
			createdAt: operation.createdAt,
			updatedAt: operation.updatedAt,
		};

		const existing = groupMap.get(key);
		if (existing) {
			existing.operations.push(operation);
			continue;
		}

		groupMap.set(key, {
			institutionId: operation.institutionId,
			institution,
			loanType: operation.loanType,
			operations: [operation],
			installments: [],
			payments: [],
		});
	}

	for (const installment of source.installments) {
		const operation = source.operations.find(
			(item) => item.id === installment.loanOperationId,
		);
		if (!operation) continue;

		const key = `${operation.institutionId}:${operation.loanType}`;
		const group = groupMap.get(key);
		if (group) {
			group.installments.push(installment);
		}
	}

	for (const payment of source.payments) {
		const operation = source.operations.find(
			(item) => item.id === payment.loanOperationId,
		);
		if (!operation) continue;

		const key = `${operation.institutionId}:${operation.loanType}`;
		const group = groupMap.get(key);
		if (group) {
			group.payments.push(payment);
		}
	}

	const accounts = Array.from(groupMap.entries())
		.map(([key, group]) => {
			const operations = [...group.operations].sort((left, right) =>
				right.updatedAt.localeCompare(left.updatedAt),
			);
			const installments = [...group.installments].sort((left, right) =>
				left.dueDate.localeCompare(right.dueDate),
			);
			const payments = [...group.payments].sort((left, right) =>
				left.paidAt.localeCompare(right.paidAt),
			);

			const principalBorrowed = sumBy(operations, (operation) =>
				toNumber(operation.principalBorrowed),
			);
			const amountReceived = sumBy(operations, (operation) =>
				toNumber(operation.amountReceived),
			);
			const totalContracted = sumBy(operations, (operation) =>
				toNumber(operation.totalContracted),
			);
			const totalInterest = sumBy(operations, (operation) =>
				toNumber(operation.totalInterest),
			);
			const totalCharge = sumBy(operations, (operation) =>
				toNumber(operation.totalCharge),
			);
			const totalPayable = sumBy(operations, (operation) =>
				toNumber(operation.totalPayable),
			);
			const paidPrincipal = sumBy(payments, (payment) =>
				toNumber(payment.principalPaid),
			);
			const paidInterest = sumBy(payments, (payment) =>
				toNumber(payment.interestPaid),
			);
			const paidCharge = sumBy(payments, (payment) =>
				toNumber(payment.chargePaid),
			);
			const totalPaid = sumBy(payments, (payment) => toNumber(payment.amount));
			const remainingPrincipal = clampMoney(principalBorrowed - paidPrincipal);
			const remainingInterest = clampMoney(totalInterest - paidInterest);
			const remainingCharge = clampMoney(totalCharge - paidCharge);
			const available =
				group.loanType === "revolving"
					? clampMoney(totalContracted - remainingPrincipal)
					: 0;
			const utilized =
				group.loanType === "revolving" ? remainingPrincipal : principalBorrowed;
			const installmentCount = installments.length;
			const paidInstallmentCount = installments.filter(
				(installment) =>
					installment.status === "paid" ||
					installment.paid ||
					toNumber(installment.paidAmount) >=
						toNumber(installment.expectedValue),
			).length;
			const summary: LoanDashboardSummary = {
				loanType: group.loanType,
				status: combineStatus(operations),
				limit: totalContracted,
				available,
				utilized,
				amountReceived,
				totalContracted,
				totalPaid,
				totalPayable: clampMoney(totalPayable),
				remainingPrincipal,
				remainingInterest,
				remainingCharge,
				paidPrincipal,
				paidInterest,
				paidCharge,
				installmentCount,
				paidInstallmentCount,
				currentInstallment: Math.max(
					...operations.map((operation) => operation.currentInstallment),
					0,
				),
				activeOperations: operations.filter(
					(operation) => operation.status === "active",
				).length,
				nextDueDate: getNextDueDate(installments, operations),
				lastPaymentDate: getLastPaymentDate(payments),
				nextPayment: clampMoney(getNextPaymentAmount(installments)),
			};

			return {
				id: key,
				institutionId: group.institutionId,
				institution: group.institution,
				institutionName: group.institution.name,
				loanType: group.loanType,
				operations,
				installments,
				payments,
				summary,
			} satisfies LoanDashboardAccount;
		})
		.sort((left, right) => {
			if (left.loanType !== right.loanType) {
				return left.loanType === "revolving" ? -1 : 1;
			}

			return left.institutionName.localeCompare(
				right.institutionName,
				"pt-BR",
				{
					sensitivity: "base",
				},
			);
		});

	const totals = accounts.reduce<LoanDashboardTotals>(
		(accumulator, account) => ({
			accounts: accumulator.accounts + 1,
			revolvingAccounts:
				accumulator.revolvingAccounts +
				(account.loanType === "revolving" ? 1 : 0),
			fixedAccounts:
				accumulator.fixedAccounts + (account.loanType === "fixed" ? 1 : 0),
			activeOperations:
				accumulator.activeOperations + account.summary.activeOperations,
			totalLimit: accumulator.totalLimit + account.summary.limit,
			totalAvailable: accumulator.totalAvailable + account.summary.available,
			totalUtilized: accumulator.totalUtilized + account.summary.utilized,
			totalPaid: accumulator.totalPaid + account.summary.totalPaid,
			totalPayable: accumulator.totalPayable + account.summary.totalPayable,
			totalDue:
				accumulator.totalDue +
				clampMoney(account.summary.totalPayable - account.summary.totalPaid),
			pendingInstallments:
				accumulator.pendingInstallments +
				account.installments.filter(
					(installment) => installment.status !== "paid",
				).length,
			nextDueDate:
				!accumulator.nextDueDate ||
				(account.summary.nextDueDate &&
					account.summary.nextDueDate < accumulator.nextDueDate)
					? account.summary.nextDueDate
					: accumulator.nextDueDate,
		}),
		{
			accounts: 0,
			revolvingAccounts: 0,
			fixedAccounts: 0,
			activeOperations: 0,
			totalLimit: 0,
			totalAvailable: 0,
			totalUtilized: 0,
			totalPaid: 0,
			totalPayable: 0,
			totalDue: 0,
			pendingInstallments: 0,
			nextDueDate: null,
		},
	);

	return {
		institutions: source.institutions,
		accounts,
		totals,
		defaultAccountId: accounts[0]?.id ?? null,
	};
}

export function formatLoanNextDueDate(value: string | Date | null | undefined) {
	return formatDateOnly(toDateOnlyString(value));
}
