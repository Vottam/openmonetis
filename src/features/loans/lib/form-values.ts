import { normalizeDecimalInput } from "@/shared/utils/currency";
import {
	addMonthsToDate,
	adjustDateToNextBusinessDay,
} from "@/shared/utils/date";
import type { LoanStatus, LoanType } from "../types";

export type LoanInstitutionFormValues = {
	name: string;
	type: "bank" | "other";
	description: string;
	logo: string;
};

export type LoanOperationFormValues = {
	institutionId: string;
	loanType: LoanType;
	primaryAmount: string;
	installmentValue: string;
	totalInstallments: string;
	nextDueDate: string;
};

export type LoanOperationPreview = {
	primaryAmount: number;
	installmentValue: number;
	totalInstallments: number;
	nextDueDate: Date;
	totalPayable: number;
	financialCost: number;
	finalDueDate: Date;
};

export type ParsedLoanOperationFormValues = {
	institutionId: string;
	loanType: LoanType;
	principalBorrowed: number;
	amountReceived: number;
	totalContracted: number;
	totalInterest: number;
	totalCharge: number;
	totalPayable: number;
	financialCost: number;
	startDate: Date;
	endDate: Date | null;
	nextDueDate: Date;
	currentInstallment: number;
	totalInstallments: number;
	status: LoanStatus;
};

type ParseFieldResult<T> =
	| { value: T; error?: never }
	| { error: string; value?: never };

function roundMoney(value: number): number {
	return Math.round(value * 100) / 100;
}

function parseMoneyValue(value: string): number | null {
	const normalized = normalizeDecimalInput(value).trim();
	if (!normalized) {
		return null;
	}

	const parsed = Number(normalized);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return null;
	}

	return parsed;
}

function parseMoneyField(
	value: string,
	label: string,
	options?: { allowZero?: boolean },
): ParseFieldResult<number> {
	const parsed = parseMoneyValue(value);
	if (parsed === null) {
		return { error: `Informe ${label} com um valor válido.` } as const;
	}

	if (options?.allowZero === false && parsed <= 0) {
		return { error: `Informe ${label} maior que zero.` } as const;
	}

	return { value: parsed } as const;
}

function parseIntegerField(
	value: string,
	label: string,
): ParseFieldResult<number> {
	const normalized = value.trim();
	if (!normalized) {
		return { error: `Informe ${label}.` } as const;
	}

	const parsed = Number.parseInt(normalized, 10);
	if (!Number.isFinite(parsed) || parsed <= 0) {
		return { error: `Informe ${label} com um número válido.` } as const;
	}

	return { value: parsed } as const;
}

function parseDateField(value: string, label: string): ParseFieldResult<Date> {
	const normalized = value.trim();
	if (!normalized) {
		return { error: `Informe ${label}.` } as const;
	}

	const parsed = new Date(`${normalized}T00:00:00.000Z`);
	if (Number.isNaN(parsed.getTime())) {
		return { error: `Informe ${label} com uma data válida.` } as const;
	}

	return { value: parsed } as const;
}

function buildPreviewFromParsedValues(params: {
	primaryAmount: number;
	installmentValue: number;
	totalInstallments: number;
	nextDueDate: Date;
}): LoanOperationPreview {
	const totalPayable = roundMoney(
		params.installmentValue * params.totalInstallments,
	);
	const financialCost = roundMoney(totalPayable - params.primaryAmount);
	const finalDueDate = adjustDateToNextBusinessDay(
		addMonthsToDate(params.nextDueDate, params.totalInstallments - 1),
	);

	return {
		primaryAmount: params.primaryAmount,
		installmentValue: params.installmentValue,
		totalInstallments: params.totalInstallments,
		nextDueDate: params.nextDueDate,
		totalPayable,
		financialCost,
		finalDueDate,
	};
}

export function buildLoanInstitutionInitialValues(): LoanInstitutionFormValues {
	return {
		name: "",
		type: "bank",
		description: "",
		logo: "",
	};
}

export function buildLoanOperationInitialValues(params?: {
	institutionId?: string | null;
	loanType?: LoanType;
}): LoanOperationFormValues {
	return {
		institutionId: params?.institutionId ?? "",
		loanType: params?.loanType ?? "revolving",
		primaryAmount: "",
		installmentValue: "",
		totalInstallments: "",
		nextDueDate: "",
	};
}

export function buildLoanOperationPreview(
	values: LoanOperationFormValues,
): LoanOperationPreview | null {
	const primaryAmount = parseMoneyValue(values.primaryAmount);
	const installmentValue = parseMoneyValue(values.installmentValue);
	const totalInstallments = parseIntegerField(
		values.totalInstallments,
		"a quantidade de parcelas",
	);
	const nextDueDate = parseDateField(
		values.nextDueDate,
		"o primeiro vencimento",
	);

	if (
		primaryAmount === null ||
		installmentValue === null ||
		"error" in totalInstallments ||
		"error" in nextDueDate
	) {
		return null;
	}

	return buildPreviewFromParsedValues({
		primaryAmount,
		installmentValue,
		totalInstallments: totalInstallments.value,
		nextDueDate: nextDueDate.value,
	});
}

export function parseLoanOperationFormValues(
	values: LoanOperationFormValues,
):
	| { ok: true; data: ParsedLoanOperationFormValues }
	| { ok: false; error: string } {
	if (!values.institutionId.trim()) {
		return { ok: false, error: "Selecione uma instituição." };
	}

	const primaryAmount = parseMoneyField(
		values.primaryAmount,
		values.loanType === "revolving"
			? "o limite concedido"
			: "o valor contratado",
		{ allowZero: false },
	);
	if ("error" in primaryAmount) {
		const error = primaryAmount.error;
		if (error !== undefined) {
			return { ok: false, error };
		}
	}

	const installmentValue = parseMoneyField(
		values.installmentValue,
		"o valor da parcela",
		{ allowZero: false },
	);
	if ("error" in installmentValue) {
		const error = installmentValue.error;
		if (error !== undefined) {
			return { ok: false, error };
		}
	}

	const totalInstallments = parseIntegerField(
		values.totalInstallments,
		"a quantidade de parcelas",
	);
	if ("error" in totalInstallments) {
		const error = totalInstallments.error;
		if (error !== undefined) {
			return { ok: false, error };
		}
	}

	const nextDueDate = parseDateField(
		values.nextDueDate,
		"o primeiro vencimento",
	);
	if ("error" in nextDueDate) {
		const error = nextDueDate.error;
		if (error !== undefined) {
			return { ok: false, error };
		}
	}

	const preview = buildPreviewFromParsedValues({
		primaryAmount: primaryAmount.value,
		installmentValue: installmentValue.value,
		totalInstallments: totalInstallments.value,
		nextDueDate: nextDueDate.value,
	});

	if (preview.financialCost < -0.005) {
		return {
			ok: false,
			error:
				"O total a pagar não pode ser menor que o valor principal informado.",
		};
	}

	return {
		ok: true,
		data: {
			institutionId: values.institutionId.trim(),
			loanType: values.loanType,
			principalBorrowed: primaryAmount.value,
			amountReceived: primaryAmount.value,
			totalContracted: primaryAmount.value,
			totalInterest: preview.financialCost,
			totalCharge: 0,
			totalPayable: preview.totalPayable,
			financialCost: preview.financialCost,
			startDate: new Date(),
			endDate: preview.finalDueDate,
			nextDueDate: preview.nextDueDate,
			currentInstallment: 1,
			totalInstallments: totalInstallments.value,
			status: "active",
		},
	};
}
