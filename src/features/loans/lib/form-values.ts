import { normalizeDecimalInput } from "@/shared/utils/currency";
import { toDateOnlyString } from "@/shared/utils/date";
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
	principalBorrowed: string;
	amountReceived: string;
	totalContracted: string;
	totalInterest: string;
	totalCharge: string;
	totalPayable: string;
	startDate: string;
	endDate: string;
	nextDueDate: string;
	totalInstallments: string;
	currentInstallment: string;
	status: LoanStatus;
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
		principalBorrowed: "",
		amountReceived: "",
		totalContracted: "",
		totalInterest: "",
		totalCharge: "",
		totalPayable: "",
		startDate: toDateOnlyString(new Date()) ?? "",
		endDate: "",
		nextDueDate: "",
		totalInstallments: "",
		currentInstallment: "1",
		status: "active",
	};
}

function parseMoneyField(
	value: string,
	label: string,
	options?: { allowZero?: boolean },
): ParseFieldResult<number> {
	const normalized = normalizeDecimalInput(value).trim();
	if (!normalized) {
		return { error: `Informe ${label}.` } as const;
	}

	const parsed = Number(normalized);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return { error: `Informe ${label} com um valor válido.` } as const;
	}

	if (options?.allowZero === false && parsed <= 0) {
		return { error: `Informe ${label} maior que zero.` } as const;
	}

	return { value: parsed } as const;
}

function parseOptionalMoneyField(value: string): ParseFieldResult<number> {
	const normalized = normalizeDecimalInput(value).trim();
	if (!normalized) {
		return { value: 0 } as const;
	}

	const parsed = Number(normalized);
	if (!Number.isFinite(parsed) || parsed < 0) {
		return {
			error: "Informe os encargos totais com um valor válido.",
		} as const;
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

export function parseLoanOperationFormValues(
	values: LoanOperationFormValues,
):
	| { ok: true; data: ParsedLoanOperationFormValues }
	| { ok: false; error: string } {
	if (!values.institutionId.trim()) {
		return { ok: false, error: "Selecione uma instituição." };
	}

	const principalBorrowed = parseMoneyField(
		values.principalBorrowed,
		"o valor principal tomado",
		{ allowZero: false },
	);
	if ("error" in principalBorrowed) {
		const error = principalBorrowed.error;
		if (error !== undefined) {
			return { ok: false, error };
		}
	}

	const amountReceived = parseMoneyField(
		values.amountReceived,
		"o valor recebido",
		{ allowZero: false },
	);
	if ("error" in amountReceived) {
		const error = amountReceived.error;
		if (error !== undefined) {
			return { ok: false, error };
		}
	}

	const totalContracted = parseMoneyField(
		values.totalContracted,
		"o limite ou total contratado",
		{ allowZero: false },
	);
	if ("error" in totalContracted) {
		const error = totalContracted.error;
		if (error !== undefined) {
			return { ok: false, error };
		}
	}

	const totalInterest = parseMoneyField(
		values.totalInterest,
		"os juros totais",
	);
	if ("error" in totalInterest) {
		const error = totalInterest.error;
		if (error !== undefined) {
			return { ok: false, error };
		}
	}

	const totalCharge = parseOptionalMoneyField(values.totalCharge);
	if ("error" in totalCharge) {
		const error = totalCharge.error;
		if (error !== undefined) {
			return { ok: false, error };
		}
	}

	const totalPayable = parseMoneyField(values.totalPayable, "o total a pagar", {
		allowZero: false,
	});
	if ("error" in totalPayable) {
		const error = totalPayable.error;
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

	const currentInstallment = parseIntegerField(
		values.currentInstallment,
		"a parcela atual",
	);
	if ("error" in currentInstallment) {
		const error = currentInstallment.error;
		if (error !== undefined) {
			return { ok: false, error };
		}
	}

	const startDate = parseDateField(values.startDate, "a data inicial");
	if ("error" in startDate) {
		const error = startDate.error;
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

	const endDate = values.endDate.trim()
		? (() => {
				const parsed = new Date(`${values.endDate.trim()}T00:00:00.000Z`);
				return Number.isNaN(parsed.getTime()) ? null : parsed;
			})()
		: null;

	if (
		totalPayable.value <
		principalBorrowed.value + totalInterest.value + totalCharge.value - 0.005
	) {
		return {
			ok: false,
			error:
				"O total a pagar não pode ser menor que principal + juros + encargos.",
		};
	}

	return {
		ok: true,
		data: {
			institutionId: values.institutionId.trim(),
			loanType: values.loanType,
			principalBorrowed: principalBorrowed.value,
			amountReceived: amountReceived.value,
			totalContracted: totalContracted.value,
			totalInterest: totalInterest.value,
			totalCharge: totalCharge.value,
			totalPayable: totalPayable.value,
			startDate: startDate.value,
			endDate,
			nextDueDate: nextDueDate.value,
			currentInstallment: currentInstallment.value,
			totalInstallments: totalInstallments.value,
			status: values.status,
		},
	};
}
