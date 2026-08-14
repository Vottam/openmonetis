import type { MonthlyPayableOccurrence } from "@/features/payables/lib/monthly-read-model";
import { getBusinessDateString } from "@/shared/utils/date";
import type {
	PayableOccurrence, PayableRecurrenceType, PayableWithOccurrences } from "./types";

export type OccurrenceActionVisibility = {
	showHistory: boolean;
	showInformAmount: boolean;
	showPay: boolean;
	showDetails: boolean;
};

export type PayableOccurrenceDetailField = {
	label: string;
	value: string;
};

function formatMoney(value: number | null | undefined): string {
	if (value === null || value === undefined) {
		return "—";
	}

	return new Intl.NumberFormat("pt-BR", {
		style: "currency",
		currency: "BRL",
	}).format(value);
}

function formatMoneyInput(value: number | null | undefined): string {
	if (value === null || value === undefined) {
		return "";
	}

	return new Intl.NumberFormat("pt-BR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	}).format(value);
}

function formatDateOnly(value: string | null | undefined): string {
	if (!value) {
		return "—";
	}

	const [year, month, day] = value.slice(0, 10).split("-");
	if (!year || !month || !day) {
		return value;
	}

	return `${day}/${month}/${year}`;
}

export const PAYABLE_RECURRENCE_LABELS: Record<PayableRecurrenceType, string> = {
	once: "Única",
	monthly_fixed: "Mensal fixa",
	monthly_variable: "Mensal variável",
};

export const PAYABLE_RECURRENCE_OPTIONS = Object.entries(
	PAYABLE_RECURRENCE_LABELS,
) as Array<[PayableRecurrenceType, string]>;

export function formatPayableRecurrenceLabel(
	recurrenceType: PayableRecurrenceType,
): string {
	return PAYABLE_RECURRENCE_LABELS[recurrenceType];
}

export type PayableLifecycleState = "active" | "inactive" | "expired";

export const PAYABLE_LIFECYCLE_LABELS: Record<PayableLifecycleState, string> = {
	active: "Ativa",
	inactive: "Inativa",
	expired: "Contrato encerrado",
};

export function getPayableLifecycleState(
	payable: Pick<PayableWithOccurrences["payable"], "endsAt" | "status">,
	referenceDate: string = getBusinessDateString(),
): PayableLifecycleState {
	if (payable.endsAt && payable.endsAt < referenceDate) {
		return "expired";
	}

	return payable.status === "cancelled" ? "inactive" : "active";
}

export function getPayableLifecycleLabel(
	payable: Pick<PayableWithOccurrences["payable"], "endsAt" | "status">,
	referenceDate: string = getBusinessDateString(),
): string {
	return PAYABLE_LIFECYCLE_LABELS[getPayableLifecycleState(payable, referenceDate)];
}

export function getPayableLifecycleActionLabel(
	payable: Pick<PayableWithOccurrences["payable"], "endsAt" | "status">,
	referenceDate: string = getBusinessDateString(),
): string {
	const state = getPayableLifecycleState(payable, referenceDate);
	if (state === "inactive") {
		return "Ativar";
	}
	if (state === "expired") {
		return "Renovar";
	}
	return "Inativar";
}

function formatMonthYear(value: string | null | undefined): string {
	if (!value) {
		return "—";
	}

	const [year, month] = value.slice(0, 10).split("-");
	if (!year || !month) {
		return value;
	}

	return `${month}/${year}`;
}

export function formatPayableTemplatePeriod(
	payable: Pick<PayableWithOccurrences["payable"], "recurrenceType" | "startsAt" | "endsAt">,
): string {
	if (payable.recurrenceType === "once") {
		return `Em ${formatDateOnly(payable.startsAt)}`;
	}

	const startsAt = formatMonthYear(payable.startsAt);
	if (payable.endsAt) {
		return `${startsAt} a ${formatMonthYear(payable.endsAt)}`;
	}

	return `${startsAt} · sem data final`;
}

export function buildPayableTemplateFields(
	payable: Pick<
		PayableWithOccurrences["payable"],
		"categoryName" | "defaultAmount" | "endsAt" | "recurrenceType" | "startsAt"
	>,
) {
	return [
		{
			label: "Periodicidade",
			value: formatPayableRecurrenceLabel(payable.recurrenceType),
		},
		{
			label: "Período",
			value: formatPayableTemplatePeriod(payable),
		},
		{
			label: "Valor padrão",
			value: formatMoney(payable.defaultAmount),
		},
		{
			label: "Primeiro vencimento",
			value: formatDateOnly(payable.startsAt),
		},
		{ label: "Categoria", value: payable.categoryName ?? "—" },
	] satisfies PayableOccurrenceDetailField[];
}

export function isEstimatedOccurrence(
	payable: Pick<PayableWithOccurrences["payable"], "recurrenceType">,
	occurrence: Pick<PayableOccurrence, "expectedAmount" | "actualAmount">,
): boolean {
	return (
		payable.recurrenceType === "monthly_variable" &&
		occurrence.expectedAmount !== null &&
		occurrence.actualAmount === null
	);
}

export function getDisplayedOccurrenceAmount(
	occurrence: Pick<PayableOccurrence, "expectedAmount" | "actualAmount">,
): number | null {
	return occurrence.actualAmount ?? occurrence.expectedAmount ?? null;
}

export function buildInformAmountInitialValue(
	occurrence: Pick<
		PayableOccurrence,
		"expectedAmount" | "actualAmount" | "remainingAmount"
	>,
): string {
	return formatMoney(
		occurrence.actualAmount ?? occurrence.expectedAmount ?? occurrence.remainingAmount,
	);
}

export function buildInformAmountInputValue(
	occurrence: Pick<
		PayableOccurrence,
		"expectedAmount" | "actualAmount" | "remainingAmount"
	>,
): string {
	return formatMoneyInput(
		occurrence.actualAmount ?? occurrence.expectedAmount ?? occurrence.remainingAmount,
	);
}

export function getOccurrenceActionVisibility(
	item: MonthlyPayableOccurrence,
	view: "operational" | "history",
): OccurrenceActionVisibility {
	return {
		showHistory: view === "operational",
		showInformAmount:
			view === "operational" &&
			(item.occurrence.status === "awaiting_amount" ||
				isEstimatedOccurrence(item.payable, item.occurrence)),
		showPay:
			item.occurrence.status === "pending" || item.occurrence.status === "partial",
		showDetails: view === "operational",
	};
}

export function buildPayableHistoryHref(payableId: string): string {
	return `/payables/${payableId}`;
}

export function buildPayableOccurrenceDetailFields(
	item: MonthlyPayableOccurrence,
): PayableOccurrenceDetailField[] {
	const { payable, occurrence } = item;
	const paymentDate = occurrence.payments.at(-1)?.paidAt ?? null;

	return [
		{ label: "Título", value: payable.description },
		{ label: "Fornecedor", value: payable.supplierName },
		{ label: "Categoria", value: payable.categoryName ?? "Sem categoria" },
		{ label: "Competência", value: occurrence.period },
		{ label: "Vencimento", value: formatDateOnly(occurrence.dueDate) },
		{
			label: "Status",
			value:
				occurrence.status === "awaiting_amount"
					? "Aguardando valor"
					: occurrence.status === "partial"
						? "Parcial"
						: occurrence.status === "paid"
							? "Paga"
							: occurrence.status === "scheduled"
								? "Agendada"
								: occurrence.status === "cancelled"
									? "Inativa"
									: occurrence.isOverdue
										? "Vencida"
										: "Pendente",
		},
		{
			label: "Valor estimado",
			value: formatMoney(occurrence.expectedAmount),
		},
		{ label: "Valor real", value: formatMoney(occurrence.actualAmount) },
		{ label: "Valor pago", value: formatMoney(occurrence.paidAmount) },
		{
			label: "Saldo restante",
			value: formatMoney(occurrence.remainingAmount),
		},
		{ label: "Data de pagamento", value: formatDateOnly(paymentDate) },
	];
}
