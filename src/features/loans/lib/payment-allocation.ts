type PaymentAllocationInput = {
	amount: number;
	remainingPrincipal: number;
	remainingInterest: number;
	remainingCharge: number;
};

export type PaymentAllocation = {
	amount: number;
	principalPaid: number;
	interestPaid: number;
	chargePaid: number;
};

function toCents(value: number): number {
	return Math.max(0, Math.round(value * 100));
}

function fromCents(value: number): number {
	return value / 100;
}

function splitByWeights(totalCents: number, weights: number[]): number[] {
	const normalizedTotal = Math.max(0, Math.trunc(totalCents));
	const normalizedWeights = weights.map((weight) =>
		Math.max(0, Math.trunc(weight)),
	);
	const weightTotal = normalizedWeights.reduce(
		(sum, weight) => sum + weight,
		0,
	);

	if (normalizedTotal <= 0 || weightTotal <= 0) {
		return Array.from({ length: weights.length }, () => 0);
	}

	const exact = normalizedWeights.map(
		(weight) => (weight * normalizedTotal) / weightTotal,
	);
	const floored = exact.map((value) => Math.floor(value));
	const remainder =
		normalizedTotal - floored.reduce((sum, value) => sum + value, 0);

	const fractions = exact
		.map((value, index) => ({ index, fraction: value - floored[index] }))
		.sort(
			(left, right) =>
				right.fraction - left.fraction || left.index - right.index,
		);

	for (let index = 0; index < remainder; index += 1) {
		floored[fractions[index].index] += 1;
	}

	return floored;
}

export function allocatePaymentComponents(
	input: PaymentAllocationInput,
): PaymentAllocation {
	const amountCents = toCents(input.amount);
	const remainingPrincipalCents = toCents(input.remainingPrincipal);
	const remainingInterestCents = toCents(input.remainingInterest);
	const remainingChargeCents = toCents(input.remainingCharge);
	const remainingTotalCents =
		remainingPrincipalCents + remainingInterestCents + remainingChargeCents;

	if (remainingTotalCents <= 0) {
		return {
			amount: 0,
			principalPaid: 0,
			interestPaid: 0,
			chargePaid: 0,
		};
	}

	const normalizedAmountCents = Math.min(amountCents, remainingTotalCents);

	if (normalizedAmountCents === remainingTotalCents) {
		return {
			amount: fromCents(normalizedAmountCents),
			principalPaid: fromCents(remainingPrincipalCents),
			interestPaid: fromCents(remainingInterestCents),
			chargePaid: fromCents(remainingChargeCents),
		};
	}

	const [principalPaidCents, interestPaidCents, chargePaidCents] =
		splitByWeights(normalizedAmountCents, [
			remainingPrincipalCents,
			remainingInterestCents,
			remainingChargeCents,
		]);

	return {
		amount: fromCents(normalizedAmountCents),
		principalPaid: fromCents(principalPaidCents),
		interestPaid: fromCents(interestPaidCents),
		chargePaid: fromCents(chargePaidCents),
	};
}
