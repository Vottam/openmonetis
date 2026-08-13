import type { SelectOption } from "@/features/transactions/components/types";

export const PAYABLE_RECURRENCE_TYPES = [
	"once",
	"monthly_fixed",
	"monthly_variable",
] as const;

export const PAYABLE_STATUSES = ["active", "cancelled"] as const;

export const PAYABLE_OCCURRENCE_STATUSES = [
	"scheduled",
	"awaiting_amount",
	"pending",
	"partial",
	"paid",
	"cancelled",
] as const;

export type PayableRecurrenceType = (typeof PAYABLE_RECURRENCE_TYPES)[number];
export type PayableStatus = (typeof PAYABLE_STATUSES)[number];
export type PayableOccurrenceStatus =
	(typeof PAYABLE_OCCURRENCE_STATUSES)[number];

export type PayableCategory = {
	id: string;
	name: string;
};

export type PayablePayment = {
	id: string;
	occurrenceId: string;
	transactionId: string;
	amount: number;
	paidAt: string;
	paymentMethod: string;
	accountId: string | null;
	accountName: string | null;
	cardId: string | null;
	cardName: string | null;
	categoryId: string | null;
	categoryName: string | null;
	transactionName: string | null;
	transactionPeriod: string | null;
	createdAt: string;
	updatedAt: string;
};

export type PayableOccurrence = {
	id: string;
	payableId: string;
	period: string;
	dueDate: string;
	expectedAmount: number | null;
	actualAmount: number | null;
	paidAmount: number;
	remainingAmount: number | null;
	status: PayableOccurrenceStatus;
	isOverdue: boolean;
	payments: PayablePayment[];
	createdAt: string;
	updatedAt: string;
};

export type PayablePaymentFormState = {
	amount: string;
	paymentMethod: string;
	accountId: string;
	cardId: string;
	paidAt: string;
	idempotencyKey: string;
};

export type Payable = {
	id: string;
	description: string;
	supplierName: string;
	categoryId: string | null;
	categoryName: string | null;
	recurrenceType: PayableRecurrenceType;
	defaultAmount: number | null;
	dueDay: number | null;
	startsAt: string;
	endsAt: string | null;
	status: PayableStatus;
	createdAt: string;
	updatedAt: string;
};

export type PayableWithOccurrences = {
	payable: Payable;
	occurrences: PayableOccurrence[];
};

export type PayablesSummary = {
	activeCount: number;
	cancelledCount: number;
	pendingCount: number;
	overdueCount: number;
	awaitingAmountCount: number;
	nextDueDate: string | null;
	nextDueAmount: number | null;
	nextDueLabel: string | null;
};

export type PayablesPageData = {
	payables: PayableWithOccurrences[];
	summary: PayablesSummary;
	categories: SelectOption[];
	accountOptions: SelectOption[];
	cardOptions: SelectOption[];
	today: string;
};
