import type { PayableOccurrenceStatus } from "./types";

const toCents = (value: number) => Math.round(value * 100);

export function sumPayablePaymentAmounts(
	payments: Array<{ amount: number | string | null }>,
): number {
	const totalCents = payments.reduce((sum, payment) => {
		const amount = Number(payment.amount ?? 0);
		if (!Number.isFinite(amount)) {
			return sum;
		}
		return sum + toCents(amount);
	}, 0);

	return totalCents / 100;
}

export function derivePayableOccurrenceStatus({
	expectedAmount,
	paidAmount,
	currentStatus,
}: {
	expectedAmount: number | null;
	paidAmount: number;
	currentStatus: PayableOccurrenceStatus;
}): PayableOccurrenceStatus {
	if (currentStatus === "cancelled" || currentStatus === "paid") {
		return currentStatus;
	}

	if (expectedAmount === null) {
		return currentStatus;
	}

	const expectedCents = toCents(expectedAmount);
	const paidCents = toCents(paidAmount);

	if (paidCents <= 0) {
		return currentStatus === "awaiting_amount" ? "awaiting_amount" : "pending";
	}

	if (paidCents < expectedCents) {
		return "partial";
	}

	return "paid";
}

export function getPayableRemainingAmount({
	expectedAmount,
	paidAmount,
}: {
	expectedAmount: number | null;
	paidAmount: number;
}): number | null {
	if (expectedAmount === null) {
		return null;
	}

	const remainingCents = toCents(expectedAmount) - toCents(paidAmount);
	return Math.max(remainingCents, 0) / 100;
}
