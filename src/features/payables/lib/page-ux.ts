import type { MonthlyPayableOccurrence } from "@/features/payables/lib/monthly-read-model";
import type { PayableOccurrence, PayableWithOccurrences } from "./types";

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
