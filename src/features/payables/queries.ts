import { and, asc, eq, ne } from "drizzle-orm";
import {
	accountsPayable,
	accountsPayableOccurrences,
	cards,
	categories,
	financialAccounts,
} from "@/db/schema";
import { db } from "@/shared/lib/db";
import { getBusinessDateString } from "@/shared/utils/date";
import { formatFinancialDateLabel } from "@/shared/utils/financial-dates";
import {
	buildPayableOccurrenceSeeds,
	isPayableOccurrenceOverdue,
} from "./lib/horizon";
import {
	isOccurrenceVisibleForPayable,
} from "./lib/monthly-read-model";
import {
	derivePayableOccurrenceStatus,
	getPayableRemainingAmount,
	sumPayablePaymentAmounts,
} from "./lib/payments";
import type {
	Payable,
	PayableOccurrence,
	PayableOccurrenceStatus,
	PayablePayment,
	PayableRecurrenceType,
	PayableStatus,
	PayablesPageData,
	PayablesSummary,
	PayableWithOccurrences,
} from "./lib/types";

const recurrenceTypes: ReadonlySet<string> = new Set([
	"once",
	"monthly_fixed",
	"monthly_variable",
]);

function toNumber(value: unknown): number | null {
	if (value === null || value === undefined || value === "") return null;
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : null;
}

function mapPayable(row: {
	id: string;
	description: string;
	supplierName: string;
	categoryId: string | null;
	category: { id: string; name: string; icon: string | null } | null;
	recurrenceType: string;
	defaultAmount: unknown;
	dueDay: number | null;
	startsAt: string;
	endsAt: string | null;
	deactivatedAt: string | null;
	status: string;
	createdAt: Date;
	updatedAt: Date;
}): Payable {
	return {
		id: row.id,
		description: row.description,
		supplierName: row.supplierName,
		categoryId: row.categoryId,
		categoryName: row.category?.name ?? null,
		categoryIcon: row.category?.icon ?? null,
		recurrenceType: recurrenceTypes.has(row.recurrenceType)
			? (row.recurrenceType as PayableRecurrenceType)
			: "once",
		defaultAmount: toNumber(row.defaultAmount),
		dueDay: row.dueDay,
		startsAt: row.startsAt,
		endsAt: row.endsAt,
		deactivatedAt: row.deactivatedAt,
		status: row.status === "cancelled" ? "cancelled" : "active",
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function mapPayment(row: {
	id: string;
	occurrenceId: string;
	transactionId: string;
	amount: unknown;
	paidAt: Date;
	paymentMethod: string;
	accountId: string | null;
	account: { name: string | null } | null;
	cardId: string | null;
	card: { name: string | null } | null;
	categoryId: string | null;
	category: { name: string | null } | null;
	transaction: { name: string | null; period: string | null } | null;
	createdAt: Date;
	updatedAt: Date;
}): PayablePayment {
	return {
		id: row.id,
		occurrenceId: row.occurrenceId,
		transactionId: row.transactionId,
		amount: toNumber(row.amount) ?? 0,
		paidAt: row.paidAt.toISOString(),
		paymentMethod: row.paymentMethod,
		accountId: row.accountId,
		accountName: row.account?.name ?? null,
		cardId: row.cardId,
		cardName: row.card?.name ?? null,
		categoryId: row.categoryId,
		categoryName: row.category?.name ?? null,
		transactionName: row.transaction?.name ?? null,
		transactionPeriod: row.transaction?.period ?? null,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

function mapOccurrence(row: {
	id: string;
	payableId: string;
	period: string;
	dueDate: string;
	expectedAmount: unknown;
	actualAmount: unknown;
	status: string;
	createdAt: Date;
	updatedAt: Date;
	payments: Array<{
		id: string;
		occurrenceId: string;
		transactionId: string;
		amount: unknown;
		paidAt: Date;
		paymentMethod: string;
		accountId: string | null;
		account: { name: string | null } | null;
		cardId: string | null;
		card: { name: string | null } | null;
		categoryId: string | null;
		category: { name: string | null } | null;
		transaction: { name: string | null; period: string | null } | null;
		createdAt: Date;
		updatedAt: Date;
	}>;
}): PayableOccurrence {
	const dueDate = row.dueDate;
	const reference = getBusinessDateString();
	const status = row.status as PayableOccurrenceStatus;
	const payments = row.payments.map(mapPayment);
	const paidAmount = sumPayablePaymentAmounts(payments);
	const expectedAmount = toNumber(row.expectedAmount);
	const actualAmount = toNumber(row.actualAmount);
	const remainingAmount = getPayableRemainingAmount({
		expectedAmount,
		actualAmount,
		paidAmount,
	});
	const derivedStatus = derivePayableOccurrenceStatus({
		expectedAmount,
		actualAmount,
		paidAmount,
		currentStatus: status,
	});
	return {
		id: row.id,
		payableId: row.payableId,
		period: row.period,
		dueDate,
		expectedAmount,
		actualAmount,
		paidAmount,
		remainingAmount,
		status: derivedStatus,
		isOverdue: isPayableOccurrenceOverdue(
			{ status: derivedStatus, dueDate },
			reference,
		),
		payments,
		createdAt: row.createdAt.toISOString(),
		updatedAt: row.updatedAt.toISOString(),
	};
}

export async function ensurePayableOccurrenceHorizon(
	userId: string,
	options?: { referencePeriod?: string; horizonMonths?: number },
): Promise<number> {
	const payables = await db.query.accountsPayable.findMany({
		where: and(
			eq(accountsPayable.userId, userId),
			eq(accountsPayable.status, "active"),
		),
		columns: {
			id: true,
			recurrenceType: true,
			defaultAmount: true,
			dueDay: true,
			startsAt: true,
			endsAt: true,
			status: true,
		},
		with: {
			occurrences: { columns: { period: true } },
		},
	});

	const seeds = payables.flatMap((payable) =>
		buildPayableOccurrenceSeeds({
			template: {
				id: payable.id,
				recurrenceType: payable.recurrenceType as PayableRecurrenceType,
				defaultAmount: payable.defaultAmount,
				dueDay: payable.dueDay,
				startsAt: payable.startsAt,
				endsAt: payable.endsAt,
				status: payable.status as PayableStatus,
			},
			existingPeriods: new Set(
				payable.occurrences.map((occurrence) => occurrence.period),
			),
			referencePeriod: options?.referencePeriod,
			horizonMonths: options?.horizonMonths,
		}),
	);

	if (!seeds.length) return 0;

	await db.insert(accountsPayableOccurrences).values(
		seeds.map((seed) => ({
			payableId: seed.payableId,
			period: seed.period,
			dueDate: seed.dueDate,
			expectedAmount:
				seed.expectedAmount === null ? null : String(seed.expectedAmount),
			actualAmount:
				seed.actualAmount === null ? null : String(seed.actualAmount),
			status: seed.status,
		})),
	);

	return seeds.length;
}

export async function fetchPayablesPageData(
	userId: string,
): Promise<PayablesPageData> {
	await ensurePayableOccurrenceHorizon(userId);
	const [payableRows, categoryRows, accountRows, cardRows] = await Promise.all([
		db.query.accountsPayable.findMany({
			where: eq(accountsPayable.userId, userId),
			with: {
				category: { columns: { id: true, name: true, icon: true } },
				occurrences: {
					orderBy: (occurrence, { asc: ascOrder }) => [
						ascOrder(occurrence.dueDate),
						ascOrder(occurrence.period),
					],
					with: {
						payments: {
							orderBy: (payment, { asc: ascOrder }) => [
								ascOrder(payment.paidAt),
								ascOrder(payment.createdAt),
							],
							with: {
								account: { columns: { name: true } },
								card: { columns: { name: true } },
								category: { columns: { name: true } },
								transaction: {
									columns: { name: true, period: true },
								},
							},
						},
					},
				},
			},
			orderBy: (payable, { asc: ascOrder, desc: descOrder }) => [
				descOrder(payable.status),
				ascOrder(payable.createdAt),
			],
		}),
		db
			.select({
				id: categories.id,
				name: categories.name,
				icon: categories.icon,
			})
			.from(categories)
			.where(eq(categories.userId, userId))
			.orderBy(asc(categories.name)),
		db.query.financialAccounts.findMany({
			columns: { id: true, name: true },
			where: eq(financialAccounts.userId, userId),
			orderBy: (account, { asc: ascOrder }) => [ascOrder(account.name)],
		}),
		db.query.cards.findMany({
			columns: { id: true, name: true },
			where: eq(cards.userId, userId),
			orderBy: (card, { asc: ascOrder }) => [ascOrder(card.name)],
		}),
	]);

	const payables = payableRows.map((row) => ({
		payable: mapPayable(row),
		occurrences: row.occurrences.map(mapOccurrence),
	})) as PayableWithOccurrences[];

	return {
		payables,
		summary: buildPayablesSummary(payables),
		categories: categoryRows.map((category) => ({
			value: category.id,
			label: category.name,
			icon: category.icon,
		})),
		accountOptions: accountRows.map((account) => ({
			value: account.id,
			label: account.name,
		})),
		cardOptions: cardRows.map((card) => ({
			value: card.id,
			label: card.name,
		})),
		today: getBusinessDateString(),
	};
}

export async function fetchPayableCalendarEvents(
	userId: string,
	period: string,
) {
	await ensurePayableOccurrenceHorizon(userId, { referencePeriod: period });

	const rows = await db
		.select({
			occurrenceId: accountsPayableOccurrences.id,
			payableId: accountsPayable.id,
			description: accountsPayable.description,
			supplierName: accountsPayable.supplierName,
			recurrenceType: accountsPayable.recurrenceType,
			categoryName: categories.name,
			defaultAmount: accountsPayable.defaultAmount,
			dueDay: accountsPayable.dueDay,
			startsAt: accountsPayable.startsAt,
			endsAt: accountsPayable.endsAt,
			deactivatedAt: accountsPayable.deactivatedAt,
			status: accountsPayable.status,
			period: accountsPayableOccurrences.period,
			dueDate: accountsPayableOccurrences.dueDate,
			expectedAmount: accountsPayableOccurrences.expectedAmount,
			actualAmount: accountsPayableOccurrences.actualAmount,
			occurrenceStatus: accountsPayableOccurrences.status,
		})
		.from(accountsPayableOccurrences)
		.innerJoin(
			accountsPayable,
			eq(accountsPayableOccurrences.payableId, accountsPayable.id),
		)
		.leftJoin(categories, eq(accountsPayable.categoryId, categories.id))
		.where(
			and(
				eq(accountsPayable.userId, userId),
				eq(accountsPayable.status, "active"),
				ne(accountsPayableOccurrences.status, "cancelled"),
			),
		)
		.orderBy(asc(accountsPayableOccurrences.dueDate));

	return rows
		.filter((row) =>
			isOccurrenceVisibleForPayable(
				{
					status: row.status as PayableStatus,
					endsAt: row.endsAt,
					deactivatedAt: row.deactivatedAt,
				},
				{ period: row.period },
			),
		)
		.map((row) => ({
		id: row.occurrenceId,
		type: "payable" as const,
		date: row.dueDate,
		payable: {
			id: row.payableId,
			description: row.description,
			supplierName: row.supplierName,
			categoryName: row.categoryName,
			recurrenceType: row.recurrenceType as PayableRecurrenceType,
			payableStatus: row.status as PayableStatus,
			occurrenceStatus: row.occurrenceStatus as PayableOccurrenceStatus,
			expectedAmount: toNumber(row.expectedAmount),
			actualAmount: toNumber(row.actualAmount),
			isOverdue: isPayableOccurrenceOverdue(
				{
					status: row.occurrenceStatus as PayableOccurrenceStatus,
					dueDate: row.dueDate,
				},
				getBusinessDateString(),
			),
			period: row.period,
			dueDate: row.dueDate,
		},
	}));
}

export function buildPayablesSummary(
	payables: PayableWithOccurrences[],
): PayablesSummary {
	const occurrences = payables.flatMap((item) =>
		item.occurrences.filter((occurrence) =>
			isOccurrenceVisibleForPayable(item.payable, occurrence),
		),
	);
	const openOccurrences = occurrences.filter(
		(occurrence) =>
			occurrence.status !== "cancelled" && occurrence.status !== "paid",
	);
	const pendingCount = openOccurrences.filter(
		(occurrence) =>
			occurrence.status === "pending" || occurrence.status === "partial",
	).length;
	const awaitingAmountCount = openOccurrences.filter(
		(occurrence) => occurrence.status === "awaiting_amount",
	).length;
	const overdueCount = openOccurrences.filter(
		(occurrence) => occurrence.isOverdue,
	).length;
	const nextOccurrence =
		openOccurrences
			.slice()
			.sort((left, right) => left.dueDate.localeCompare(right.dueDate))[0] ??
		null;

	return {
		activeCount: payables.filter((item) => item.payable.status === "active")
			.length,
		cancelledCount: payables.filter(
			(item) => item.payable.status === "cancelled",
		).length,
		pendingCount,
		overdueCount,
		awaitingAmountCount,
		nextDueDate: nextOccurrence?.dueDate ?? null,
		nextDueAmount: nextOccurrence?.expectedAmount ?? null,
		nextDueLabel: nextOccurrence
			? formatFinancialDateLabel(nextOccurrence.dueDate, "Vence em")
			: null,
	};
}
