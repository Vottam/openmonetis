// Pure helpers for monthly payables read model
// These functions receive occurrence data and compute monthly summaries
// No side effects, no database calls, pure computations

export type OccurrenceStatus =
	| "scheduled"
	| "pending"
	| "partial"
	| "paid"
	| "overdue"
	| "awaiting_amount"
	| "cancelled";

export interface MonthlySummary {
	totalKnown: number; // in cents, sum of known values from non-cancelled occurrences
	paid: number; // in cents, sum of paidAmount from paid/partial occurrences
	remaining: number; // in cents, sum of remainingAmount from non-paid occurrences
	overdue: number; // in cents, sum of remainingAmount from overdue occurrences
	awaitingAmountCount: number; // count of occurrences with status awaiting_amount
}

/** Month filter based on year/month competence */
export interface MonthFilter {
	year: number;
	month: number; // 1-12
}

/**
 * Filters occurrences by monthly competence
 * Competence is determined by occurrence.period
 * The payment date does NOT determine the competence month
 */
export function filterOccurrencesByCompetence(
	occurrences: any[],
	filter: MonthFilter,
): any[] {
	return occurrences.filter((occ) => {
		const occPeriod = occ.period;
		if (!occPeriod) return false;
		const [periodYear, periodMonth] = occPeriod.split("-").map(Number);
		return periodYear === filter.year && periodMonth === filter.month;
	});
}

/**
 * Computes the monthly summary from a list of occurrences
 * Key rules per Phase B2:
 * - Cancelled occurrences are excluded
 * - 'paid' status: paidAmount contributes to 'paid'
 * - 'partial' status: both paidAmount AND remainingAmount contribute (this is the key B2 rule)
 * - 'pending' status with isOverdue=true: remainingAmount contributes to overdue
 * - 'overdue' status: remainingAmount contributes to overdue
 * - 'awaiting_amount' status: no monetary value, counted separately
 * - totalKnown = sum of known values (expectedAmount or actualAmount) from active occurrences
 */
export function computeMonthlySummary(occurrences: any[]): MonthlySummary {
	let totalKnown = 0;
	let paid = 0;
	let remaining = 0;
	let overdue = 0;
	let awaitingAmountCount = 0;

	occurrences.forEach((occ) => {
		// Skip cancelled occurrences
		if (occ.status === "cancelled") return;

		// Total known: sum of known values from non-cancelled occurrences
		if (occ.expectedAmount !== null && occ.expectedAmount !== undefined) {
			totalKnown += occ.expectedAmount;
		}
		if (occ.actualAmount !== null && occ.actualAmount !== undefined) {
			totalKnown += occ.actualAmount;
		}

		// Status-based logic using occurrence.status field
		const isPaid = occ.status === "paid";
		const isPartial = occ.status === "partial";
		const isPending = occ.status === "pending";
		const isOverdue = occ.status === "overdue";
		const isAwaiting = occ.status === "awaiting_amount";

		// Paid amount: count paidAmount for 'paid' and 'partial' statuses
		if (isPaid && occ.paidAmount !== null && occ.paidAmount !== undefined) {
			paid += occ.paidAmount;
		}
		if (isPartial && occ.paidAmount !== null && occ.paidAmount !== undefined) {
			paid += occ.paidAmount;
		}

		// Remaining amount logic
		if (occ.remainingAmount !== null && occ.remainingAmount > 0) {
			if (isPartial) {
				// Partial: remainingAmount is part of the outstanding balance
				remaining += occ.remainingAmount;
			} else if (isPaid) {
				// Paid but still has remaining (e.g., partial payment made)
				remaining += occ.remainingAmount;
			} else if (isPending || isOverdue) {
				// Pending/Overdue: remainingAmount is the outstanding value
				remaining += occ.remainingAmount;
				if (isOverdue) {
					overdue += occ.remainingAmount;
				}
			}
			// 'scheduled': treat like pending (amount not yet due)
			// 'awaiting_amount': no monetary remaining yet (handled below via count)
		}

		// Awaiting amount count
		if (isAwaiting) {
			awaitingAmountCount += 1;
		}
	});

	return {
		totalKnown,
		paid,
		remaining,
		overdue,
		awaitingAmountCount,
	};
}

/**
 * Validates the invariant: Total known = Paid + Remaining
 * When all values are known and no awaiting_amount, this should hold exactly.
 */
export function validateInvariance(summary: MonthlySummary): boolean {
	return summary.totalKnown === summary.paid + summary.remaining;
}

/**
 * Determines the visual status of an occurrence for display purposes
 * Priority: paid > overdue > partial > pending > awaiting > cancelled
 * Uses occurrence.status as primary determinant, isOverdue as secondary.
 */
export function getOccurrenceDisplayStatus(
	occ: any,
): "paid" | "overdue" | "partial" | "awaiting" | "pending" | "cancelled" {
	if (occ.status === "cancelled") return "cancelled";
	if (occ.status === "paid") return "paid";
	if (occ.status === "awaiting_amount") return "awaiting";
	if (occ.isOverdue) return "overdue";
	if (
		occ.status === "partial" ||
		(occ.partialPayments && occ.partialPayments > 0)
	)
		return "partial";
	return "pending";
}

/**
 * Gets the competence month string from an occurrence
 */
export function getCompetenceMonthString(occ: any): string | null {
	if (occ.period) return occ.period;
	if (occ.dueDate) {
		const d = new Date(occ.dueDate);
		return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
	}
	return null;
}

/**
 * Sorts occurrences for display in the monthly panel
 * Priority: overdue > partial > pending > awaiting > paid
 * Uses occurrence.isOverdue field for the overdue determination.
 */
export function sortOccurrencesForDisplay(occurrences: any[]): any[] {
	const statusPriority: Record<string, number> = {
		overdue: 0,
		partial: 1,
		pending: 2,
		awaiting: 3,
		paid: 4,
		cancelled: 5,
	};

	return [...occurrences].sort((a, b) => {
		const Sa = getOccurrenceDisplayStatus(a);
		const Sb = getOccurrenceDisplayStatus(b);
		const pa = statusPriority[Sa] ?? 99;
		const pb = statusPriority[Sb] ?? 99;
		if (pa !== pb) return pa - pb;
		// Within same status, sort by due date ascending
		const da = new Date(a.dueDate ?? "").getTime();
		const db = new Date(b.dueDate ?? "").getTime();
		return da - db;
	});
}
