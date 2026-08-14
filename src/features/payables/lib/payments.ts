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
	actualAmount,
	paidAmount,
	currentStatus,
}: {
	expectedAmount: number | null;
	actualAmount: number | null;
	paidAmount: number;
	currentStatus: PayableOccurrenceStatus;
}): PayableOccurrenceStatus {
	if (currentStatus === "cancelled" || currentStatus === "paid") {
		return currentStatus;
	}

	const dueAmount =
		actualAmount !== null ? actualAmount : expectedAmount;
	if (dueAmount === null) {
		return currentStatus;
	}

	const dueCents = toCents(dueAmount);
	const paidCents = toCents(paidAmount);

	if (paidCents <= 0) {
		return currentStatus === "awaiting_amount" ? "awaiting_amount" : "pending";
	}

	if (paidCents < dueCents) {
		return "partial";
	}

	return "paid";
}

export function getPayableRemainingAmount({
	expectedAmount,
	actualAmount,
	paidAmount,
}: {
	expectedAmount: number | null;
	actualAmount: number | null;
	paidAmount: number;
}): number | null {
	// Valor devido: actualAmount (confirmado) ?? expectedAmount (estimado)
	const dueAmount =
		actualAmount !== null ? actualAmount : expectedAmount;
	if (dueAmount === null) {
		return null;
	}

	const remainingCents = toCents(dueAmount) - toCents(paidAmount);
	return Math.max(remainingCents, 0) / 100;
}
