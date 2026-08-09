// @ts-nocheck
/**
 * Tipos de UI para o módulo de Empréstimos
 */

import type {
	Installment,
	LoanStatus,
	LoanSummary,
	LoanType,
	Payment,
} from "./types";

export type LoanAccount = {
	id: string;
	name: string;
	institutionName: string;
	institutionId: string;
	loanType: LoanType;
	summary: LoanSummary;
	installments: Installment[];
	payments: Payment[];
	createdAt: string;
	updatedAt: string;
};

export type LoanFormValues = {
	name: string;
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

export type InstallmentFormValues = {
	loanOperationId: string;
	installmentNumber: number;
	dueDate: string;
	expectedValue: string;
	expectedPrincipal: string;
	expectedInterest: string;
	status: "pending" | "paid" | "overdue" | "partial";
};

export type PaymentFormValues = {
	installmentId: string;
	amount: string;
	principalPaid: string;
	interestPaid: string;
	chargePaid: string;
	paidAt: string;
	status: "paid" | "partial" | "overdue";
};

export type LoanInstitutionFormValues = {
	name: string;
	type: string;
	description: string;
};

export type LoanSummaryCard = {
	institutionName: string;
	loanType: LoanType;
	limit: number;
	available: number;
	utilized: number;
	totalPayable: number;
	remainingPrincipal: number;
	remainingInterest: number;
	remainingCharge: number;
	nextPayment: number;
	installmentCount: number;
	currentInstallment: number;
	activeOperations: number;
	status: LoanStatus;
	createdAt: string;
	updatedAt: string;
};
