"use server";

import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
	institutions,
	loanInstallments,
	loanOperations,
	loanPayments,
} from "@/db/schema";
import { revalidateForEntity } from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import { toDateOnlyString } from "@/shared/utils/date";
import { allocatePaymentComponents } from "./lib/payment-allocation";

const dateLikeSchema = z
	.union([z.date(), z.string()])
	.transform((value) => (value instanceof Date ? value : new Date(value)));

const optionalDateLikeSchema = z
	.union([z.date(), z.string(), z.null(), z.undefined()])
	.transform((value) => {
		if (value === null || value === undefined || value === "") {
			return null;
		}

		return value instanceof Date ? value : new Date(value);
	});

const numericSchema = z.number().finite().nonnegative();
const positiveNumericSchema = z.number().finite().positive();

const createLoanInstitutionSchema = z.object({
	name: z.string().trim().min(1, "Informe o nome da instituição."),
	type: z.enum(["bank", "other"]),
	description: z.string().trim().optional().default(""),
	logo: z.string().trim().optional().default(""),
});

const createLoanOperationSchema = z.object({
	institutionId: z.string().trim().min(1, "Informe a instituição."),
	loanType: z.enum(["revolving", "fixed"]),
	principalBorrowed: positiveNumericSchema,
	amountReceived: positiveNumericSchema,
	totalContracted: positiveNumericSchema,
	totalInterest: numericSchema,
	totalCharge: numericSchema,
	totalPayable: positiveNumericSchema,
	startDate: dateLikeSchema,
	endDate: optionalDateLikeSchema,
	nextDueDate: dateLikeSchema,
	currentInstallment: z.number().int().positive(),
	totalInstallments: z.number().int().positive(),
	status: z.enum(["active", "paid", "overdue", "cancelled"]),
});

const updateLoanOperationSchema = createLoanOperationSchema.extend({
	id: z.string().trim().min(1, "Informe o empréstimo."),
});

const createInstallmentSchema = z.object({
	loanOperationId: z.string().trim().min(1, "Informe a operação."),
	installmentNumber: z.number().int().positive(),
	dueDate: dateLikeSchema,
	expectedValue: numericSchema,
	expectedPrincipal: numericSchema,
	expectedInterest: numericSchema,
	status: z.enum(["pending", "paid", "overdue", "partial"]),
});

const recordPaymentSchema = z.object({
	installmentId: z.string().trim().min(1, "Informe a parcela."),
	amount: positiveNumericSchema,
	principalPaid: numericSchema,
	interestPaid: numericSchema,
	chargePaid: numericSchema,
	paidAt: dateLikeSchema,
	status: z.enum(["paid", "partial", "overdue"]),
});

const updateInstallmentStatusSchema = z.object({
	installmentId: z.string().trim().min(1, "Informe a parcela."),
	status: z.enum(["pending", "paid", "overdue", "partial"]),
	paidAmount: numericSchema,
	paidPrincipal: numericSchema,
	paidInterest: numericSchema,
	paidDate: dateLikeSchema,
});

const updatePaymentStatusSchema = z.object({
	paymentId: z.string().trim().min(1, "Informe o pagamento."),
	status: z.enum(["paid", "partial", "overdue"]),
});

const updateLoanOperationStatusSchema = z.object({
	id: z.string().trim().min(1, "Informe o empréstimo."),
	status: z.enum(["active", "paid", "overdue", "cancelled"]),
});

async function syncLoanOperationStatusAfterPayment(
	loanOperationId: string,
	userId: string,
) {
	const operation = await db.query.loanOperations.findFirst({
		columns: { id: true, loanType: true, status: true },
		where: and(eq(loanOperations.id, loanOperationId), eq(loanOperations.userId, userId)),
	});

	if (!operation || operation.loanType !== "fixed") {
		return;
	}

	const installments = await db.query.loanInstallments.findMany({
		columns: { expectedValue: true, paidAmount: true },
		where: and(
			eq(loanInstallments.loanOperationId, loanOperationId),
			eq(loanInstallments.userId, userId),
		),
	});

	if (installments.length === 0) {
		return;
	}

	const allInstallmentsPaid = installments.every((installment) => {
		const remaining = Number(installment.expectedValue ?? 0) - Number(installment.paidAmount ?? 0);
		return remaining <= 0.005;
	});

	if (!allInstallmentsPaid || operation.status === "paid") {
		return;
	}

	await db
		.update(loanOperations)
		.set({ status: "paid", updatedAt: new Date() })
		.where(
			and(eq(loanOperations.id, loanOperationId), eq(loanOperations.userId, userId)),
		);
}

async function getCurrentUser() {
	return getUser();
}

export async function createLoanInstitutionAction(input: unknown) {
	try {
		const user = await getCurrentUser();
		const data = createLoanInstitutionSchema.parse(input);

		const [created] = await db
			.insert(institutions)
			.values({
				id: randomUUID(),
				name: data.name,
				type: data.type,
				description: data.description || null,
				logo: data.logo || null,
				userId: user.id,
			})
			.returning({ id: institutions.id });

		revalidateForEntity("loans", user.id);

		return {
			success: true,
			message: "Instituição criada com sucesso.",
			institutionId: created.id,
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Algo deu errado",
		};
	}
}

export async function deleteLoanInstitutionAction(input: { id: string }) {
	try {
		const user = await getCurrentUser();

		const [deleted] = await db
			.delete(institutions)
			.where(
				and(eq(institutions.id, input.id), eq(institutions.userId, user.id)),
			)
			.returning({ id: institutions.id });

		if (!deleted) {
			return { success: false, error: "Instituição não encontrada." };
		}

		revalidateForEntity("loans", user.id);

		return { success: true, message: "Instituição removida com sucesso." };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Algo deu errado",
		};
	}
}

export async function createLoanOperationAction(input: unknown) {
	try {
		const user = await getCurrentUser();
		const data = createLoanOperationSchema.parse(input);

		if (
			data.totalPayable <
			data.principalBorrowed + data.totalInterest + data.totalCharge
		) {
			return {
				success: false,
				error:
					"O valor total a pagar não pode ser menor que a soma dos componentes.",
			};
		}

		const [created] = await db
			.insert(loanOperations)
			.values({
				institutionId: data.institutionId,
				loanType: data.loanType,
				principalBorrowed: formatDecimalForDbRequired(data.principalBorrowed),
				amountReceived: formatDecimalForDbRequired(data.amountReceived),
				totalContracted: formatDecimalForDbRequired(data.totalContracted),
				totalInterest: formatDecimalForDbRequired(data.totalInterest),
				totalCharge: formatDecimalForDbRequired(data.totalCharge),
				totalPayable: formatDecimalForDbRequired(data.totalPayable),
				startDate: toDateOnlyString(data.startDate) ?? "",
				endDate: data.endDate ? toDateOnlyString(data.endDate) : undefined,
				nextDueDate: toDateOnlyString(data.nextDueDate) ?? "",
				currentInstallment: data.currentInstallment,
				totalInstallments: data.totalInstallments,
				status: data.status,
				userId: user.id,
			})
			.returning({ id: loanOperations.id });

		revalidateForEntity("loans", user.id);

		return {
			success: true,
			message: "Empréstimo criado com sucesso.",
			loanOperationId: created.id,
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Algo deu errado",
		};
	}
}

export async function updateLoanOperationAction(input: unknown) {
	try {
		const user = await getCurrentUser();
		const data = updateLoanOperationSchema.parse(input);

		const [updated] = await db
			.update(loanOperations)
			.set({
				institutionId: data.institutionId,
				loanType: data.loanType,
				principalBorrowed: formatDecimalForDbRequired(data.principalBorrowed),
				amountReceived: formatDecimalForDbRequired(data.amountReceived),
				totalContracted: formatDecimalForDbRequired(data.totalContracted),
				totalInterest: formatDecimalForDbRequired(data.totalInterest),
				totalCharge: formatDecimalForDbRequired(data.totalCharge),
				totalPayable: formatDecimalForDbRequired(data.totalPayable),
				startDate: toDateOnlyString(data.startDate) ?? "",
				endDate: data.endDate ? toDateOnlyString(data.endDate) : undefined,
				nextDueDate: toDateOnlyString(data.nextDueDate) ?? "",
				currentInstallment: data.currentInstallment,
				totalInstallments: data.totalInstallments,
				status: data.status,
				updatedAt: new Date(),
			})
			.where(
				and(eq(loanOperations.id, data.id), eq(loanOperations.userId, user.id)),
			)
			.returning({ id: loanOperations.id });

		if (!updated) {
			return { success: false, error: "Empréstimo não encontrado." };
		}

		revalidateForEntity("loans", user.id);

		return { success: true, message: "Empréstimo atualizado com sucesso." };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Algo deu errado",
		};
	}
}

export async function updateLoanOperationStatusAction(input: unknown) {
	try {
		const user = await getCurrentUser();
		const data = updateLoanOperationStatusSchema.parse(input);

		const [updated] = await db
			.update(loanOperations)
			.set({ status: data.status, updatedAt: new Date() })
			.where(
				and(eq(loanOperations.id, data.id), eq(loanOperations.userId, user.id)),
			)
			.returning({ id: loanOperations.id });

		if (!updated) {
			return { success: false, error: "Empréstimo não encontrado." };
		}

		revalidateForEntity("loans", user.id);

		return { success: true, message: "Status do empréstimo atualizado." };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Algo deu errado",
		};
	}
}

export async function deleteLoanOperationAction(input: { id: string }) {
	try {
		const user = await getCurrentUser();

		const [deleted] = await db
			.delete(loanOperations)
			.where(
				and(
					eq(loanOperations.id, input.id),
					eq(loanOperations.userId, user.id),
				),
			)
			.returning({ id: loanOperations.id });

		if (!deleted) {
			return { success: false, error: "Empréstimo não encontrado." };
		}

		revalidateForEntity("loans", user.id);

		return { success: true, message: "Empréstimo removido com sucesso." };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Algo deu errado",
		};
	}
}

export async function createInstallmentAction(input: unknown) {
	try {
		const user = await getCurrentUser();
		const data = createInstallmentSchema.parse(input);

		const [created] = await db
			.insert(loanInstallments)
			.values({
				loanOperationId: data.loanOperationId,
				installmentNumber: data.installmentNumber,
				dueDate: toDateOnlyString(data.dueDate) ?? "",
				expectedValue: formatDecimalForDbRequired(data.expectedValue),
				expectedPrincipal: formatDecimalForDbRequired(data.expectedPrincipal),
				expectedInterest: formatDecimalForDbRequired(data.expectedInterest),
				paid: data.status === "paid",
				paidAmount: formatDecimalForDbRequired(
					data.status === "paid" ? data.expectedValue : 0,
				),
				paidPrincipal: formatDecimalForDbRequired(
					data.status === "paid" ? data.expectedPrincipal : 0,
				),
				paidInterest: formatDecimalForDbRequired(
					data.status === "paid" ? data.expectedInterest : 0,
				),
				paidDate: data.status === "paid" ? new Date() : null,
				status: data.status,
				userId: user.id,
			})
			.returning({ id: loanInstallments.id });

		revalidateForEntity("loans", user.id);

		return {
			success: true,
			message: "Parcela criada com sucesso.",
			installmentId: created.id,
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Algo deu errado",
		};
	}
}

export async function updateInstallmentStatusAction(input: unknown) {
	try {
		const user = await getCurrentUser();
		const data = updateInstallmentStatusSchema.parse(input);

		const [updated] = await db
			.update(loanInstallments)
			.set({
				status: data.status,
				paid: data.status === "paid",
				paidAmount: formatDecimalForDbRequired(data.paidAmount),
				paidPrincipal: formatDecimalForDbRequired(data.paidPrincipal),
				paidInterest: formatDecimalForDbRequired(data.paidInterest),
				paidDate: data.paidDate,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(loanInstallments.id, data.installmentId),
					eq(loanInstallments.userId, user.id),
				),
			)
			.returning({ id: loanInstallments.id });

		if (!updated) {
			return { success: false, error: "Parcela não encontrada." };
		}

		revalidateForEntity("loans", user.id);

		return { success: true, message: "Parcela atualizada com sucesso." };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Algo deu errado",
		};
	}
}

export async function updatePaymentStatusAction(input: unknown) {
	try {
		const user = await getCurrentUser();
		const data = updatePaymentStatusSchema.parse(input);

		const [updated] = await db
			.update(loanPayments)
			.set({ status: data.status, updatedAt: new Date() })
			.where(
				and(
					eq(loanPayments.id, data.paymentId),
					eq(loanPayments.userId, user.id),
				),
			)
			.returning({ id: loanPayments.id });

		if (!updated) {
			return { success: false, error: "Pagamento não encontrado." };
		}

		revalidateForEntity("loans", user.id);

		return { success: true, message: "Pagamento atualizado com sucesso." };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Algo deu errado",
		};
	}
}

export async function recordPaymentAction(input: unknown) {
	try {
		const user = await getCurrentUser();
		const data = recordPaymentSchema.parse(input);

		const installment = await db.query.loanInstallments.findFirst({
			where: and(
				eq(loanInstallments.id, data.installmentId),
				eq(loanInstallments.userId, user.id),
			),
		});

		if (!installment) {
			return { success: false, error: "Parcela não encontrada." };
		}

		const existingPayments = await db.query.loanPayments.findMany({
			where: and(
				eq(loanPayments.installmentId, installment.id),
				eq(loanPayments.userId, user.id),
			),
		});

		const paidCharge = existingPayments.reduce(
			(sum, payment) => sum + Number(payment.chargePaid ?? 0),
			0,
		);
		const remainingPrincipal =
			Number(installment.expectedPrincipal ?? 0) -
			Number(installment.paidPrincipal ?? 0);
		const remainingInterest =
			Number(installment.expectedInterest ?? 0) -
			Number(installment.paidInterest ?? 0);
		const remainingCharge = Math.max(
			0,
			Number(installment.expectedValue ?? 0) -
				Number(installment.expectedPrincipal ?? 0) -
				Number(installment.expectedInterest ?? 0) -
				paidCharge,
		);
		const allocation = allocatePaymentComponents({
			amount: data.amount,
			remainingPrincipal,
			remainingInterest,
			remainingCharge,
		});
		const currentPaid = Number(installment.paidAmount ?? 0);
		const nextPaid = currentPaid + allocation.amount;

		if (nextPaid > Number(installment.expectedValue ?? 0) + 0.005) {
			return {
				success: false,
				error:
					"O pagamento não pode ser maior que o valor esperado da parcela.",
			};
		}

		const [created] = await db
			.insert(loanPayments)
			.values({
				loanOperationId: installment.loanOperationId,
				installmentId: installment.id,
				installmentNumber: installment.installmentNumber,
				amount: formatDecimalForDbRequired(allocation.amount),
				principalPaid: formatDecimalForDbRequired(allocation.principalPaid),
				interestPaid: formatDecimalForDbRequired(allocation.interestPaid),
				chargePaid: formatDecimalForDbRequired(allocation.chargePaid),
				paidAt: data.paidAt,
				status: data.status,
				userId: user.id,
			})
			.returning({ id: loanPayments.id });

		await db
			.update(loanInstallments)
			.set({
				paid: data.status === "paid",
				paidAmount: formatDecimalForDbRequired(nextPaid),
				paidPrincipal: formatDecimalForDbRequired(
					Number(installment.paidPrincipal ?? 0) + allocation.principalPaid,
				),
				paidInterest: formatDecimalForDbRequired(
					Number(installment.paidInterest ?? 0) + allocation.interestPaid,
				),
				paidDate: data.paidAt,
				status: data.status === "paid" ? "paid" : data.status,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(loanInstallments.id, installment.id),
					eq(loanInstallments.userId, user.id),
				),
			);

		await syncLoanOperationStatusAfterPayment(installment.loanOperationId, user.id);

		revalidateForEntity("loans", user.id);

		return {
			success: true,
			message: "Pagamento registrado com sucesso.",
			paymentId: created.id,
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Algo deu errado",
		};
	}
}

export async function deleteInstallmentAction(input: { id: string }) {
	try {
		const user = await getCurrentUser();

		const [deleted] = await db
			.delete(loanInstallments)
			.where(
				and(
					eq(loanInstallments.id, input.id),
					eq(loanInstallments.userId, user.id),
				),
			)
			.returning({ id: loanInstallments.id });

		if (!deleted) {
			return { success: false, error: "Parcela não encontrada." };
		}

		revalidateForEntity("loans", user.id);

		return { success: true, message: "Parcela removida com sucesso." };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Algo deu errado",
		};
	}
}

export async function deletePaymentAction(input: { id: string }) {
	try {
		const user = await getCurrentUser();

		const [deleted] = await db
			.delete(loanPayments)
			.where(
				and(eq(loanPayments.id, input.id), eq(loanPayments.userId, user.id)),
			)
			.returning({ id: loanPayments.id });

		if (!deleted) {
			return { success: false, error: "Pagamento não encontrado." };
		}

		revalidateForEntity("loans", user.id);

		return { success: true, message: "Pagamento removido com sucesso." };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : "Algo deu errado",
		};
	}
}
