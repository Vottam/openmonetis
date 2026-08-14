import { getBusinessDateString, toDateOnlyString } from "@/shared/utils/date";
import {
	adjustDateToNextBusinessDay,
	buildBusinessDueDateFromPeriodDay,
} from "@/shared/utils/financial-dates";
import {
	addMonthsToPeriod,
	buildPeriodRange,
	comparePeriods,
	getCurrentPeriod,
} from "@/shared/utils/period";
import type {
	PayableOccurrenceStatus,
	PayableRecurrenceType,
	PayableStatus,
} from "./types";

export const PAYABLE_OCCURRENCE_HORIZON_MONTHS = 6;

export type PayableTemplateLike = {
	id: string;
	recurrenceType: PayableRecurrenceType;
	defaultAmount: number | string | null;
	dueDay: number | null;
	startsAt: string | Date;
	endsAt: string | Date | null;
	status: PayableStatus;
};

export type PayableOccurrenceSeed = {
	payableId: string;
	period: string;
	dueDate: string;
	expectedAmount: number | null;
	actualAmount: number | null;
	status: PayableOccurrenceStatus;
};

function getDateDay(value: string | Date): number {
	const normalized = toDateOnlyString(value);
	if (!normalized) {
		return 1;
	}

	return Number.parseInt(normalized.slice(8, 10), 10) || 1;
}

function toPeriodString(value: string | Date): string {
	const normalized = toDateOnlyString(value);
	return normalized ? normalized.slice(0, 7) : getCurrentPeriod();
}

export function isPayableOccurrenceOverdue(
	occurrence: {
		status: PayableOccurrenceStatus;
		dueDate: string | Date;
	},
	referenceDate: string | Date = getBusinessDateString(),
): boolean {
	if (occurrence.status === "paid" || occurrence.status === "cancelled") {
		return false;
	}

	const dueDate = toDateOnlyString(occurrence.dueDate);
	const reference = toDateOnlyString(referenceDate);
	if (!dueDate || !reference) {
		return false;
	}

	return dueDate < reference;
}

export function resolveOccurrenceVisualStatus(
	occurrence: {
		status: PayableOccurrenceStatus;
		dueDate: string | Date;
	},
	referenceDate: string | Date = getBusinessDateString(),
): PayableOccurrenceStatus | "overdue" {
	if (isPayableOccurrenceOverdue(occurrence, referenceDate)) {
		return "overdue";
	}

	return occurrence.status;
}

export function buildPayableOccurrenceDueDate(
	template: Pick<PayableTemplateLike, "recurrenceType" | "startsAt" | "dueDay">,
	period: string,
): string | null {
	if (template.recurrenceType === "once") {
		return toDateOnlyString(
			adjustDateToNextBusinessDay(new Date(template.startsAt)),
		);
	}

	const anchorDay = String(template.dueDay ?? getDateDay(template.startsAt));
	return buildBusinessDueDateFromPeriodDay(period, anchorDay);
}

export function buildPayableOccurrencePeriodRange(
	template: Pick<PayableTemplateLike, "recurrenceType" | "startsAt" | "endsAt">,
	referencePeriod: string = getCurrentPeriod(),
	horizonMonths: number = PAYABLE_OCCURRENCE_HORIZON_MONTHS,
): string[] {
	const startPeriod = template.endsAt
		? toPeriodString(template.startsAt)
		: referencePeriod;
	const endPeriod = template.endsAt
		? toPeriodString(template.endsAt)
		: addMonthsToPeriod(referencePeriod, horizonMonths - 1);

	if (template.recurrenceType === "once") {
		return [startPeriod];
	}

	if (comparePeriods(startPeriod, endPeriod) > 0) {
		return [];
	}

	return buildPeriodRange(startPeriod, endPeriod);
}

export function buildPayableOccurrenceSeeds({
	template,
	existingPeriods,
	referencePeriod = getCurrentPeriod(),
	horizonMonths = PAYABLE_OCCURRENCE_HORIZON_MONTHS,
}: {
	template: PayableTemplateLike;
	existingPeriods: ReadonlySet<string>;
	referencePeriod?: string;
	horizonMonths?: number;
}): PayableOccurrenceSeed[] {
	if (template.status === "cancelled") {
		return [];
	}

	const periods = buildPayableOccurrencePeriodRange(
		template,
		referencePeriod,
		horizonMonths,
	);
	const defaultAmount =
		template.defaultAmount === null ? null : Number(template.defaultAmount);
	const expectedAmount =
		template.recurrenceType === "monthly_variable" && defaultAmount === null
			? null
			: defaultAmount;
	const baseStatus: PayableOccurrenceStatus =
		template.recurrenceType === "monthly_variable" && defaultAmount === null
			? "awaiting_amount"
			: "pending";

	return periods
		.filter((period) => !existingPeriods.has(period))
		.flatMap((period) => {
			const dueDate = buildPayableOccurrenceDueDate(template, period);
			if (!dueDate) {
				return [];
			}

			return [
				{
					payableId: template.id,
					period,
					dueDate,
					expectedAmount,
					actualAmount: null,
					status: baseStatus,
				},
			];
		});
}

export function getPayableOccurrenceLabel(
	seed: Pick<PayableOccurrenceSeed, "expectedAmount" | "status">,
): string {
	if (seed.status === "awaiting_amount" || seed.expectedAmount === null) {
		return "Aguardando valor";
	}

	return "Pendente";
}
