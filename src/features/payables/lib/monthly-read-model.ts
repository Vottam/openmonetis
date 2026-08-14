import { toDateOnlyString } from "@/shared/utils/date";
import { comparePeriods, parsePeriod } from "@/shared/utils/period";
import type {
	PayableOccurrence,
	PayableOccurrenceStatus,
	PayablePayment,
	PayableRecurrenceType,
	PayableStatus,
	PayableWithOccurrences,
} from "./types";

export interface MonthFilter {
	year: number;
	month: number;
}

export interface MonthlySummary {
	totalKnown: number;
	paid: number;
	remaining: number;
	overdue: number;
	awaitingAmountCount: number;
}

export type MonthlyPayableOccurrence = {
	payable: {
		id: string;
		description: string;
		supplierName: string;
		categoryId: string | null;
		categoryName: string | null;
		categoryIcon: string | null;
		recurrenceType: PayableRecurrenceType;
		status: PayableStatus;
	};
	occurrence: {
		id: string;
		payableId: string;
		period: string;
		dueDate: string;
		expectedAmount: number | null;
		actualAmount: number | null;
		paidAmount: number;
		remainingAmount: number | null;
		status: PayableOccurrenceStatus;
		isOverdue: boolean;
		payments: PayablePayment[];
		createdAt: string;
		updatedAt: string;
	};
};

type OccurrenceLike = {
	id?: string;
	period: string | null | undefined;
	dueDate?: string | null | undefined;
	expectedAmount?: number | null | undefined;
	actualAmount?: number | null | undefined;
	paidAmount?: number | null | undefined;
	remainingAmount?: number | null | undefined;
	status: PayableOccurrenceStatus;
	isOverdue: boolean;
	payments?: PayablePayment[];
};

type OccurrenceLikeDetailed = OccurrenceLike & {
	id: string;
	payments: PayablePayment[];
};

function toMinorUnits(value: number): number {
	return Math.round(value * 100);
}

function fromMinorUnits(value: number): number {
	return value / 100;
}

function hasPeriod(value: string | null | undefined): value is string {
	if (!value) {
		return false;
	}

	try {
		parsePeriod(value);
		return true;
	} catch {
		return false;
	}
}

function getOpenBalanceAmount(occurrence: OccurrenceLike): number {
	if (occurrence.status === "paid" || occurrence.status === "cancelled") {
		return 0;
	}

	if (
		occurrence.remainingAmount !== null &&
		occurrence.remainingAmount !== undefined
	) {
		return Math.max(occurrence.remainingAmount, 0);
	}

	if (
		occurrence.expectedAmount !== null &&
		occurrence.expectedAmount !== undefined
	) {
		return Math.max(occurrence.expectedAmount, 0);
	}

	return 0;
}

export function isValidPeriod(
	value: string | null | undefined,
): value is string {
	return hasPeriod(value);
}

export function filterOccurrencesByCompetence<T extends OccurrenceLike>(
	occurrences: readonly T[],
	filter: MonthFilter,
): T[] {
	return occurrences.filter((occurrence) => {
		if (!hasPeriod(occurrence.period)) {
			return false;
		}

		try {
			const { year, month } = parsePeriod(occurrence.period);
			return year === filter.year && month === filter.month;
		} catch {
			return false;
		}
	});
}

export function getCompetenceMonthString(
	occurrence: Pick<OccurrenceLike, "period">,
): string | null {
	return hasPeriod(occurrence.period) ? occurrence.period : null;
}

export function computeMonthlySummary(
	occurrences: readonly OccurrenceLike[],
): MonthlySummary {
	let totalKnown = 0;
	let paid = 0;
	let remaining = 0;
	let overdue = 0;
	let awaitingAmountCount = 0;

	for (const occurrence of occurrences) {
		if (occurrence.status === "cancelled") {
			continue;
		}

		// Incluir expectedAmount no totalKnown mesmo se status for awaiting_amount
		// Isso permite que valores estimados participem de projeções/orçamento
		if (
			occurrence.expectedAmount !== null &&
			occurrence.expectedAmount !== undefined
		) {
			totalKnown += occurrence.expectedAmount;
		}

		if (occurrence.status === "paid" || occurrence.status === "partial") {
			paid += occurrence.paidAmount ?? 0;
		}

		// Contar como awaitingAmount apenas se realmente não tem expectedAmount
		if (
			occurrence.status === "awaiting_amount" &&
			(occurrence.expectedAmount === null ||
				occurrence.expectedAmount === undefined)
		) {
			awaitingAmountCount += 1;
			continue;
		}

		const openBalance = getOpenBalanceAmount(occurrence);
		if (openBalance > 0) {
			remaining += openBalance;
			if (occurrence.isOverdue) {
				overdue += openBalance;
			}
		}
	}

	return {
		totalKnown,
		paid,
		remaining,
		overdue,
		awaitingAmountCount,
	};
}

export function validateInvariance(summary: MonthlySummary): boolean {
	return summary.totalKnown === summary.paid + summary.remaining;
}

export function getOccurrenceDisplayStatus(
	occurrence: OccurrenceLike,
):
	| "paid"
	| "overdue"
	| "partial"
	| "awaiting"
	| "pending"
	| "cancelled"
	| "scheduled" {
	if (occurrence.status === "cancelled") {
		return "cancelled";
	}

	if (occurrence.status === "paid") {
		return "paid";
	}

	if (occurrence.status === "awaiting_amount") {
		return "awaiting";
	}

	if (occurrence.status === "partial") {
		return "partial";
	}

	if (occurrence.isOverdue) {
		return "overdue";
	}

	if (occurrence.status === "scheduled") {
		return "scheduled";
	}

	return "pending";
}

export function sortOccurrencesForDisplay<T extends OccurrenceLike>(
	occurrences: readonly T[],
): T[] {
	const priority: Record<string, number> = {
		overdue: 0,
		partial: 1,
		pending: 2,
		scheduled: 3,
		awaiting: 4,
		paid: 5,
		cancelled: 6,
	};

	return [...occurrences].sort((left, right) => {
		const leftStatus = getOccurrenceDisplayStatus(left);
		const rightStatus = getOccurrenceDisplayStatus(right);
		const leftPriority = priority[leftStatus] ?? 99;
		const rightPriority = priority[rightStatus] ?? 99;

		if (leftPriority !== rightPriority) {
			return leftPriority - rightPriority;
		}

		return (left.dueDate ?? "").localeCompare(right.dueDate ?? "");
	});
}

export function sortMonthlyPayableOccurrences(
	occurrences: readonly MonthlyPayableOccurrence[],
): MonthlyPayableOccurrence[] {
	const orderedOccurrenceIds = new Map(
		sortOccurrencesForDisplay(occurrences.map((item) => item.occurrence)).map(
			(occurrence, index) => [occurrence.id, index],
		),
	);

	return [...occurrences].sort((left, right) => {
		const leftIndex = orderedOccurrenceIds.get(left.occurrence.id) ?? 0;
		const rightIndex = orderedOccurrenceIds.get(right.occurrence.id) ?? 0;
		return leftIndex - rightIndex;
	});
}

export function buildMonthlyPayableOccurrences(
	payables: readonly PayableWithOccurrences[],
	period: string,
): MonthlyPayableOccurrence[] {
	return payables.flatMap((entry) =>
		entry.occurrences
			.filter((occurrence) => occurrence.period === period)
			.map((occurrence) => ({
				payable: {
					id: entry.payable.id,
					description: entry.payable.description,
					supplierName: entry.payable.supplierName,
					categoryId: entry.payable.categoryId,
					categoryName: entry.payable.categoryName,
					categoryIcon: entry.payable.categoryIcon,
					recurrenceType: entry.payable.recurrenceType,
					status: entry.payable.status,
				},
				occurrence: {
					id: occurrence.id,
					payableId: occurrence.payableId,
					period: occurrence.period,
					dueDate: occurrence.dueDate,
					expectedAmount: occurrence.expectedAmount,
					actualAmount: occurrence.actualAmount,
					paidAmount: occurrence.paidAmount,
					remainingAmount: occurrence.remainingAmount,
					status: occurrence.status,
					isOverdue: occurrence.isOverdue,
					payments: occurrence.payments,
					createdAt: occurrence.createdAt,
					updatedAt: occurrence.updatedAt,
				},
			})),
	);
}

export function buildUpcomingMonthlyPayableOccurrences(
	payables: readonly PayableWithOccurrences[],
	period: string,
): MonthlyPayableOccurrence[] {
	return payables.flatMap((entry) =>
		entry.occurrences
			.filter((occurrence) => {
				if (!hasPeriod(occurrence.period)) {
					return false;
				}

				return comparePeriods(occurrence.period, period) > 0;
			})
			.filter(
				(occurrence) =>
					occurrence.status !== "paid" && occurrence.status !== "cancelled",
			)
			.map((occurrence) => ({
				payable: {
					id: entry.payable.id,
					description: entry.payable.description,
					supplierName: entry.payable.supplierName,
					categoryId: entry.payable.categoryId,
					categoryName: entry.payable.categoryName,
					categoryIcon: entry.payable.categoryIcon,
					recurrenceType: entry.payable.recurrenceType,
					status: entry.payable.status,
				},
				occurrence: {
					id: occurrence.id,
					payableId: occurrence.payableId,
					period: occurrence.period,
					dueDate: occurrence.dueDate,
					expectedAmount: occurrence.expectedAmount,
					actualAmount: occurrence.actualAmount,
					paidAmount: occurrence.paidAmount,
					remainingAmount: occurrence.remainingAmount,
					status: occurrence.status,
					isOverdue: occurrence.isOverdue,
					payments: occurrence.payments,
					createdAt: occurrence.createdAt,
					updatedAt: occurrence.updatedAt,
				},
			})),
	);
}

export function toCurrencyCents(value: number): number {
	return toMinorUnits(value);
}

export function fromCurrencyCents(value: number): number {
	return fromMinorUnits(value);
}

export function getOperationalPeriodBounds(period: string): {
	startDate: string;
	endDate: string;
} {
	const { year, month } = parsePeriod(period);
	const startDate = toDateOnlyString(new Date(Date.UTC(year, month - 1, 1)));
	const endDate = toDateOnlyString(new Date(Date.UTC(year, month, 0)));

	if (!startDate || !endDate) {
		throw new Error("Período operacional inválido.");
	}

	return { startDate, endDate };
}

function isVisibleInOperationalWindow(
	occurrence: OccurrenceLike,
	bounds: ReturnType<typeof getOperationalPeriodBounds>,
): boolean {
	if (!hasPeriod(occurrence.period)) {
		return false;
	}

	const dueDate = occurrence.dueDate;
	if (!dueDate) {
		return false;
	}

	if (occurrence.status === "cancelled") {
		return false;
	}

	if (dueDate > bounds.endDate) {
		return false;
	}

	if (dueDate >= bounds.startDate) {
		return true;
	}

	return occurrence.status !== "paid";
}

function toDetailedOccurrence(
	entry: Pick<MonthlyPayableOccurrence, "payable">,
	occurrence: PayableOccurrence,
): MonthlyPayableOccurrence {
	return {
		payable: entry.payable,
		occurrence: {
			id: occurrence.id,
			payableId: occurrence.payableId,
			period: occurrence.period,
			dueDate: occurrence.dueDate,
			expectedAmount: occurrence.expectedAmount,
			actualAmount: occurrence.actualAmount,
			paidAmount: occurrence.paidAmount,
			remainingAmount: occurrence.remainingAmount,
			status: occurrence.status,
			isOverdue: occurrence.isOverdue,
			payments: occurrence.payments,
			createdAt: occurrence.createdAt,
			updatedAt: occurrence.updatedAt,
		},
	};
}

export function buildOperationalMonthlyPayableOccurrences(
	payables: readonly PayableWithOccurrences[],
	period: string,
): MonthlyPayableOccurrence[] {
	const bounds = getOperationalPeriodBounds(period);

	return payables.flatMap((entry) =>
		entry.occurrences
			.filter((occurrence) => isVisibleInOperationalWindow(occurrence, bounds))
			.map((occurrence) =>
				toDetailedOccurrence({ payable: entry.payable }, occurrence),
			),
	);
}

export function buildHistoricalPayableOccurrences(
	payables: readonly PayableWithOccurrences[],
): MonthlyPayableOccurrence[] {
	return payables.flatMap((entry) =>
		entry.occurrences
			.filter((occurrence) => occurrence.status !== "cancelled")
			.map((occurrence) =>
				toDetailedOccurrence({ payable: entry.payable }, occurrence),
			),
	);
}

export function getOccurrenceLatestPaymentDate(
	occurrence: Pick<OccurrenceLike, "payments">,
): string | null {
	const payments = occurrence.payments ?? [];
	if (!payments.length) {
		return null;
	}

	const lastPayment = payments[payments.length - 1];
	return lastPayment?.paidAt ?? null;
}
