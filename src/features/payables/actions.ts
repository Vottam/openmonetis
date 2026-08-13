"use server";

import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
	accountsPayable,
	accountsPayableOccurrences,
	accountsPayablePayments,
	categories,
	transactions,
} from "@/db/schema";
import { validateAllOwnership } from "@/features/transactions/actions/core";
import { PAYMENT_METHODS } from "@/features/transactions/lib/constants";
import { buildPayablePaymentNote } from "@/shared/lib/accounts/constants";
import {
	type ActionResult,
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import { getBusinessDateString, toDateOnlyString } from "@/shared/utils/date";
import { PAYABLE_RECURRENCE_TYPES } from "./lib/types";
import { ensurePayableOccurrenceHorizon } from "./queries";

const dateOnlySchema = z.preprocess(
	(value) => {
		const normalized = toDateOnlyString(
			value as Date | string | null | undefined,
		);
		return normalized ?? value;
	},
	z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida."),
);

const optionalDateOnlySchema = z.preprocess(
	(value) => {
		if (value === null || value === undefined || value === "") {
			return null;
		}

		return toDateOnlyString(value as Date | string);
	},
	z.union([
		z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Informe uma data válida."),
		z.null(),
	]),
);

const nullableUuidSchema = z
	.union([z.string().uuid(), z.literal(""), z.null(), z.undefined()])
	.transform((value) => {
		if (value === "" || value === null || value === undefined) {
			return null;
		}

		return value;
	});

const recurrenceTypeSchema = z.enum(PAYABLE_RECURRENCE_TYPES);

const payableBaseSchema = z.object({
	description: z.string().trim().min(1, "Informe a descrição."),
	supplierName: z.string().trim().min(1, "Informe o fornecedor."),
	categoryId: nullableUuidSchema,
	recurrenceType: recurrenceTypeSchema,
	defaultAmount: z.union([z.number().finite().positive(), z.null()]).optional(),
	startsAt: dateOnlySchema,
	endsAt: optionalDateOnlySchema,
});

const createPayableSchema = payableBaseSchema;
const updatePayableSchema = payableBaseSchema.extend({
	id: z.string().uuid("Informe a conta a pagar."),
});

function validatePayableAmountRules(data: {
	recurrenceType: (typeof PAYABLE_RECURRENCE_TYPES)[number];
	defaultAmount?: number | null;
}) {
	if (data.recurrenceType === "monthly_variable") {
		if (data.defaultAmount !== null && data.defaultAmount !== undefined) {
			return "Contas variáveis não devem receber valor padrão.";
		}
		return null;
	}

	if (data.defaultAmount === null || data.defaultAmount === undefined) {
		return "Informe o valor da conta.";
	}

	return null;
}

const deletePayableSchema = z.object({
	id: z.string().uuid("Informe a conta a pagar."),
});

const cancelPayableSchema = z.object({
	id: z.string().uuid("Informe a conta a pagar."),
});

const createPayablePaymentSchema = z.object({
	occurrenceId: z.string().uuid("Informe a ocorrência."),
	amount: z.number().finite().positive("Informe um valor válido."),
	paymentMethod: z.enum(PAYMENT_METHODS, {
		message: "Selecione uma forma de pagamento válida.",
	}),
	accountId: z.union([z.string().uuid(), z.null()]).optional(),
	cardId: z.union([z.string().uuid(), z.null()]).optional(),
	paidAt: z
		.string()
		.trim()
		.regex(/^\d{4}-\d{2}-\d{2}$/u, "Informe uma data válida.")
		.optional(),
	idempotencyKey: z.string().uuid("Informe uma chave de idempotência válida."),
});

const informOccurrenceAmountSchema = z.object({
	occurrenceId: z.string().uuid("Informe a ocorrência."),
	amount: z.number().finite().positive("Informe um valor válido."),
});

function getDueDay(value: string): number {
	return Number.parseInt(value.slice(8, 10), 10);
}

function stableUuidFromString(value: string): string {
	const hex = createHash("sha256").update(value).digest("hex");
	const timeLow = hex.slice(0, 8);
	const timeMid = hex.slice(8, 12);
	const timeHi = (Number.parseInt(hex.slice(12, 16), 16) & 0x0fff) | 0x4000;
	const clockSeq = (Number.parseInt(hex.slice(16, 20), 16) & 0x3fff) | 0x8000;
	const node = hex.slice(20, 32);
	return `${timeLow}-${timeMid}-${timeHi.toString(16).padStart(4, "0")}-${clockSeq.toString(16).padStart(4, "0")}-${node}`;
}

async function ensureCategoryOwnership(
	userId: string,
	categoryId: string | null,
) {
	if (!categoryId) {
		return null;
	}

	const category = await db.query.categories.findFirst({
		columns: { id: true },
		where: and(eq(categories.id, categoryId), eq(categories.userId, userId)),
	});

	return category ?? null;
}

async function fetchPayableForUser(userId: string, payableId: string) {
	return db.query.accountsPayable.findFirst({
		where: and(
			eq(accountsPayable.id, payableId),
			eq(accountsPayable.userId, userId),
		),
		columns: { id: true, status: true },
	});
}

export async function createPayableAction(
	input: unknown,
): Promise<ActionResult<{ payableId: string }>> {
	try {
		const user = await getUser();
		const data = createPayableSchema.parse(input);
		const amountError = validatePayableAmountRules(data);
		if (amountError) {
			return { success: false, error: amountError };
		}

		const category = await ensureCategoryOwnership(user.id, data.categoryId);
		if (data.categoryId && !category) {
			return {
				success: false,
				error: "Categoria não encontrada para este usuário.",
			};
		}

		const [created] = await db
			.insert(accountsPayable)
			.values({
				description: data.description,
				supplierName: data.supplierName,
				categoryId: data.categoryId,
				recurrenceType: data.recurrenceType,
				defaultAmount:
					data.defaultAmount === null || data.defaultAmount === undefined
						? null
						: formatDecimalForDbRequired(data.defaultAmount),
				dueDay:
					data.recurrenceType === "once" ? null : getDueDay(data.startsAt),
				startsAt: data.startsAt,
				endsAt: data.endsAt,
				status: "active",
				userId: user.id,
			})
			.returning({ id: accountsPayable.id });

		await ensurePayableOccurrenceHorizon(user.id);
		revalidateForEntity("payables", user.id);

		return {
			success: true,
			message: "Conta a pagar criada com sucesso.",
			data: { payableId: created.id },
		};
	} catch (error) {
		return handleActionError(error) as ActionResult<{ payableId: string }>;
	}
}

export async function updatePayableAction(
	input: unknown,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = updatePayableSchema.parse(input);
		const existing = await fetchPayableForUser(user.id, data.id);
		if (!existing) {
			return { success: false, error: "Conta a pagar não encontrada." };
		}

		const amountError = validatePayableAmountRules(data);
		if (amountError) {
			return { success: false, error: amountError };
		}

		const category = await ensureCategoryOwnership(user.id, data.categoryId);
		if (data.categoryId && !category) {
			return {
				success: false,
				error: "Categoria não encontrada para este usuário.",
			};
		}

		await db
			.update(accountsPayable)
			.set({
				description: data.description,
				supplierName: data.supplierName,
				categoryId: data.categoryId,
				recurrenceType: data.recurrenceType,
				defaultAmount:
					data.recurrenceType === "monthly_variable"
						? null
						: formatDecimalForDbRequired(data.defaultAmount ?? 0),
				dueDay:
					data.recurrenceType === "once" ? null : getDueDay(data.startsAt),
				startsAt: data.startsAt,
				endsAt: data.endsAt,
				updatedAt: new Date(),
			})
			.where(
				and(
					eq(accountsPayable.id, data.id),
					eq(accountsPayable.userId, user.id),
				),
			);

		await ensurePayableOccurrenceHorizon(user.id);
		revalidateForEntity("payables", user.id);
		return { success: true, message: "Conta a pagar atualizada com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function cancelPayableAction(
	input: unknown,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = cancelPayableSchema.parse(input);
		const existing = await fetchPayableForUser(user.id, data.id);
		if (!existing) {
			return { success: false, error: "Conta a pagar não encontrada." };
		}

		await db
			.update(accountsPayable)
			.set({ status: "cancelled", updatedAt: new Date() })
			.where(
				and(
					eq(accountsPayable.id, data.id),
					eq(accountsPayable.userId, user.id),
				),
			);

		await db
			.update(accountsPayableOccurrences)
			.set({ status: "cancelled", updatedAt: new Date() })
			.where(eq(accountsPayableOccurrences.payableId, data.id));

		revalidateForEntity("payables", user.id);
		return { success: true, message: "Conta a pagar cancelada com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function deletePayableAction(
	input: unknown,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = deletePayableSchema.parse(input);
		const existing = await fetchPayableForUser(user.id, data.id);
		if (!existing) {
			return { success: false, error: "Conta a pagar não encontrada." };
		}

		await db
			.delete(accountsPayable)
			.where(
				and(
					eq(accountsPayable.id, data.id),
					eq(accountsPayable.userId, user.id),
				),
			);

		revalidateForEntity("payables", user.id);
		return { success: true, message: "Conta a pagar removida com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function informOccurrenceAmountAction(
	input: unknown,
): Promise<ActionResult> {
	try {
		const user = await getUser();
		const data = informOccurrenceAmountSchema.parse(input);

		const occurrence = await db
			.select({
				occurrenceId: accountsPayableOccurrences.id,
				status: accountsPayableOccurrences.status,
				payableId: accountsPayable.id,
			})
			.from(accountsPayableOccurrences)
			.innerJoin(
				accountsPayable,
				eq(accountsPayableOccurrences.payableId, accountsPayable.id),
			)
			.where(
				and(
					eq(accountsPayableOccurrences.id, data.occurrenceId),
					eq(accountsPayable.userId, user.id),
				),
			)
			.limit(1);

		const current = occurrence[0];
		if (!current) {
			return { success: false, error: "Ocorrência não encontrada." };
		}
		if (current.status !== "awaiting_amount") {
			return { success: false, error: "Esta ocorrência já possui valor." };
		}

		await db
			.update(accountsPayableOccurrences)
			.set({
				expectedAmount: formatDecimalForDbRequired(data.amount),
				status: "pending",
				updatedAt: new Date(),
			})
			.where(eq(accountsPayableOccurrences.id, data.occurrenceId));

		revalidateForEntity("payables", user.id);
		return { success: true, message: "Valor informado com sucesso." };
	} catch (error) {
		return handleActionError(error);
	}
}

export async function createPayablePaymentAction(
	input: unknown,
): Promise<ActionResult<{ paymentId: string; transactionId: string }>> {
	try {
		const user = await getUser();
		const data = createPayablePaymentSchema.parse(input);

		const occurrence = await db.query.accountsPayableOccurrences.findFirst({
			columns: {
				id: true,
				payableId: true,
				period: true,
				dueDate: true,
				expectedAmount: true,
				actualAmount: true,
				status: true,
			},
			where: eq(accountsPayableOccurrences.id, data.occurrenceId),
			with: {
				payable: {
					columns: {
						userId: true,
						description: true,
						supplierName: true,
						categoryId: true,
					},
				},
				payments: { columns: { id: true, amount: true } },
			},
		});

		if (!occurrence || occurrence.payable.userId !== user.id) {
			return { success: false, error: "Ocorrência não encontrada." };
		}

		if (occurrence.status === "cancelled") {
			return { success: false, error: "Esta ocorrência foi cancelada." };
		}

		const paidAmountSoFar = occurrence.payments.reduce((sum, payment) => {
			const amount = Number(payment.amount ?? 0);
			return Number.isFinite(amount) ? sum + amount : sum;
		}, 0);
		const expectedAmount =
			occurrence.expectedAmount === null
				? null
				: Number(occurrence.expectedAmount);
		const paymentAmount = Number(data.amount);
		const remainingAmount =
			expectedAmount === null
				? null
				: Math.max(expectedAmount - paidAmountSoFar, 0);

		if (data.paymentMethod === "Cartão de crédito") {
			if (!data.cardId) {
				return { success: false, error: "Selecione o cartão." };
			}
		} else if (!data.accountId) {
			return { success: false, error: "Selecione a conta." };
		}

		const ownershipError = await validateAllOwnership(user.id, {
			accountId:
				data.paymentMethod === "Cartão de crédito" ? null : data.accountId,
			cardId: data.paymentMethod === "Cartão de crédito" ? data.cardId : null,
		});
		if (ownershipError) {
			return { success: false, error: ownershipError };
		}

		const paidAt = data.paidAt ?? getBusinessDateString();
		const note = buildPayablePaymentNote(occurrence.id, occurrence.period);
		const isCardPayment = data.paymentMethod === "Cartão de crédito";
		const transactionPeriod = paidAt.slice(0, 7);
		const paymentDate = new Date(`${paidAt}T00:00:00.000Z`);
		const amountDb = formatDecimalForDbRequired(paymentAmount);
		const accountId = isCardPayment ? null : (data.accountId ?? null);
		const cardId = isCardPayment ? (data.cardId ?? null) : null;
		const idempotencyKey = data.idempotencyKey;
		const transactionId = stableUuidFromString(`transaction:${idempotencyKey}`);
		const paymentId = stableUuidFromString(`payment:${idempotencyKey}`);

		const existingPayment = await db.query.accountsPayablePayments.findFirst({
			columns: { id: true, transactionId: true },
			where: eq(accountsPayablePayments.idempotencyKey, idempotencyKey),
		});
		if (existingPayment) {
			return {
				success: true,
				message: "Pagamento registrado com sucesso.",
				data: {
					paymentId: existingPayment.id,
					transactionId: existingPayment.transactionId,
				},
			};
		}

		if (
			occurrence.status === "awaiting_amount" ||
			expectedAmount === null ||
			!Number.isFinite(expectedAmount)
		) {
			return {
				success: false,
				error: "Informe o valor da ocorrência antes de pagar.",
			};
		}

		if (remainingAmount !== null && paymentAmount > remainingAmount + 0.005) {
			return { success: false, error: "Valor maior que o saldo restante." };
		}

		const paymentResult = await db.transaction(async (tx) => {
			const [transactionRow] = await tx
				.insert(transactions)
				.values({
					id: transactionId,
					condition: "À vista",
					name: `Pagamento ${occurrence.payable.description}`,
					paymentMethod: data.paymentMethod,
					note,
					amount: amountDb,
					purchaseDate: paymentDate,
					transactionType: "Despesa",
					period: transactionPeriod,
					isSettled: isCardPayment ? null : true,
					userId: user.id,
					cardId,
					accountId,
					categoryId: isCardPayment
						? (occurrence.payable.categoryId ?? null)
						: null,
				})
				.onConflictDoNothing()
				.returning({ id: transactions.id });

			if (!transactionRow) {
				const [conflictPayment] = await tx
					.select({
						id: accountsPayablePayments.id,
						transactionId: accountsPayablePayments.transactionId,
					})
					.from(accountsPayablePayments)
					.where(eq(accountsPayablePayments.idempotencyKey, idempotencyKey))
					.limit(1);
				if (!conflictPayment) {
					throw new Error("Falha ao resolver retry de pagamento.");
				}
				return {
					paymentId: conflictPayment.id,
					transactionId: conflictPayment.transactionId,
				};
			}

			const [paymentRow] = await tx
				.insert(accountsPayablePayments)
				.values({
					id: paymentId,
					occurrenceId: occurrence.id,
					transactionId: transactionRow.id,
					idempotencyKey,
					amount: amountDb,
					paidAt: paymentDate,
					paymentMethod: data.paymentMethod,
					accountId,
					cardId,
					categoryId: isCardPayment
						? (occurrence.payable.categoryId ?? null)
						: null,
				})
				.onConflictDoNothing()
				.returning({
					id: accountsPayablePayments.id,
					transactionId: accountsPayablePayments.transactionId,
				});

			if (!paymentRow) {
				const [conflictPayment] = await tx
					.select({
						id: accountsPayablePayments.id,
						transactionId: accountsPayablePayments.transactionId,
					})
					.from(accountsPayablePayments)
					.where(eq(accountsPayablePayments.idempotencyKey, idempotencyKey))
					.limit(1);
				if (!conflictPayment) {
					throw new Error("Falha ao resolver retry de pagamento.");
				}
				return {
					paymentId: conflictPayment.id,
					transactionId: conflictPayment.transactionId,
				};
			}

			const nextPaidAmount = paidAmountSoFar + paymentAmount;
			await tx
				.update(accountsPayableOccurrences)
				.set({
					actualAmount: formatDecimalForDbRequired(nextPaidAmount),
					status: nextPaidAmount + 0.005 >= expectedAmount ? "paid" : "partial",
					updatedAt: new Date(),
				})
				.where(eq(accountsPayableOccurrences.id, occurrence.id));

			return {
				paymentId: paymentRow.id,
				transactionId: paymentRow.transactionId,
			};
		});

		revalidateForEntity("payables", user.id);
		revalidateForEntity("transactions", user.id);

		return {
			success: true,
			message: "Pagamento registrado com sucesso.",
			data: paymentResult,
		};
	} catch (error) {
		return handleActionError(error) as ActionResult<{
			paymentId: string;
			transactionId: string;
		}>;
	}
}
