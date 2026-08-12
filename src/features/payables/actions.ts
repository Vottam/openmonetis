"use server";

import { and, eq } from "drizzle-orm";
import { z } from "zod";
import {
	accountsPayable,
	accountsPayableOccurrences,
	categories,
} from "@/db/schema";
import {
	type ActionResult,
	handleActionError,
	revalidateForEntity,
} from "@/shared/lib/actions/helpers";
import { getUser } from "@/shared/lib/auth/server";
import { db } from "@/shared/lib/db";
import { formatDecimalForDbRequired } from "@/shared/utils/currency";
import { toDateOnlyString } from "@/shared/utils/date";
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

const informOccurrenceAmountSchema = z.object({
	occurrenceId: z.string().uuid("Informe a ocorrência."),
	amount: z.number().finite().positive("Informe um valor válido."),
});

function getDueDay(value: string): number {
	return Number.parseInt(value.slice(8, 10), 10);
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
