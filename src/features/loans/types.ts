/**
 * Tipos de domínio para o módulo de Empréstimos (Fase 1)
 *
 * Arquitetura conceitual:
 *   Instituição → Conta / Linha de Crédito → Operações de Empréstimo → Parcelas → Pagamentos
 *
 * Conceito financeiro central (nunca confundir):
 *   - Limite concedido: limite total da linha de crédito
 *   - Principal utilizado: valor total já tomado no crédito
 *   - Limite disponível: limite concedido - principal utilizado
 *   - Total ainda a pagar: principal restante + juros restantes + encargos restantes
 *
 * Para crédito rotativo:
 *   limite disponível = limite atualmente concedido - principal atualmente utilizado
 *
 * Para empréstimo fixo:
 *   não há recomposição automática de limite disponível ao pagar
 *   a parcela reduz a dívida mas não recompõe um "limite disponível"
 *
 * Pagamento de parcela:
 *   - principal amortizado → reduz principal em aberto → recompõe limite (se produto for rotativo)
 *   - juros pagos → reduz custo financeiro restante → NÃO recompõe limite
 *
 * Regra principal: limite recomposto = principal amortizado (somente para rotativo)
 */

export type LoanInstitution = {
	id: string;
	name: string;
	type: "bank" | "other";
	description?: string;
	createdAt: string;
	updatedAt: string;
};

export type LoanType = "revolving" | "fixed";

export type LoanStatus = "active" | "paid" | "overdue" | "cancelled";

export type LoanPeriod = "monthly" | "biweekly" | "weekly";

export type LoanTerm = {
	totalInstallments: number;
	currentInstallment: number;
};

export type LoanPrincipal = {
	totalReceived: number; // valor efetivamente recebido
	totalBorrowed: number; // valor principal tomado (contração)
	remaining: number; // principal restante a pagar
};

export type LoanInterest = {
	totalInterest: number; // custo financeiro total
	remainingInterest: number; // juros restantes a pagar
};

export type LoanCharge = {
	totalCharge: number; // encargos totais (tarifas, taxas, etc.)
	remainingCharge: number; // encargos restantes
};

export type LoanSummary = {
	institution: LoanInstitution;
	loanType: LoanType;
	limit: number; // limite concedido (favorítivo)
	available: number; // limite disponível (rotativo apenas)
	utilized: number; // principal utilizado
	totalPayable: number; // total a pagar (principal + juros + encargos)
	remainingPrincipal: number; // principal restante
	remainingInterest: number; // juros restantes
	remainingCharge: number; // encargos restantes
	installmentCount: number; // total de parcelas
	currentInstallment: number; // parcela atual
	nextPayment: number; // próximo valor da parcela
	activeOperations: number; // operações ativas
	status: LoanStatus;
	createdAt: string;
	updatedAt: string;
};

export type Installment = {
	id: string;
	loanOperationId: string;
	installmentNumber: number;
	dueDate: string; // YYYY-MM-DD
	expectedValue: number; // valor previsto da parcela
	expectedPrincipal: number; // principal previsto
	expectedInterest: number; // juros/encargos previstos
	paid: boolean;
	paidAmount: number;
	paidPrincipal: number;
	paidInterest: number;
	paidDate: string | null;
	status: "pending" | "paid" | "overdue" | "partial";
};

export type Payment = {
	id: string;
	loanOperationId: string;
	installmentId: string;
	installmentNumber: number;
	amount: number;
	principalPaid: number;
	interestPaid: number;
	chargePaid: number;
	paidAt: string;
	status: "paid" | "partial" | "overdue";
};

export type LoanOperation = {
	id: string;
	loanId: string;
	institutionId: string;
	loanType: LoanType;
	principalBorrowed: number;
	amountReceived: number;
	totalContracted: number;
	totalInterest: number;
	totalCharge: number;
	totalPayable: number;
	startDate: string;
	endDate: string | null;
	nextDueDate: string;
	currentInstallment: number;
	totalInstallments: number;
	status: "active" | "paid" | "overdue" | "cancelled";
	createdAt: string;
	updatedAt: string;
};

export type LoanEntry = {
	institution: LoanInstitution;
	loanType: LoanType;
	summary: LoanSummary;
	installments: Installment[];
	payments: Payment[];
	createdAt: string;
	updatedAt: string;
};

/**
 * Regras financeiras para crédito rotativo:
 *
 * 1. Limite disponível = limite concedido - principal utilizado
 * 2. Pagamento de parcela:
 *    - principal amortizado → reduz principal em aberto → recompõe limite (rotativo)
 *    - juros pagos → reduz custo financeiro restante → NÃO recompõe limite
 * 3. Limite recomposto = principal amortizado (apenas para rotativo)
 * 4. Total a pagar = principal restante + juros restantes + encargos restantes
 * 5. Juros NÃO consomem nem recompõem limite
 * 6. Principal pago > principal restante → erro (não pode pagar mais do que estádevido)
 */
export type LoanRegulatoryRules = {
	revolving: {
		availableBalance: (limit: number, utilized: number) => number;
		repayment: (limit: number, utilized: number, payment: number) => number;
		repaymentPrincipal: (
			limit: number,
			utilized: number,
			payment: number,
		) => number;
		repaymentInterest: (
			interestRemaining: number,
			interestPaid: number,
		) => number;
	};
	fixed: {
		// Não recomposição automática de limite
		availableBalance: (limit: number, utilized: number) => number;
		repayment: (remaining: number, payment: number) => number;
		repaymentPrincipal: (remaining: number, payment: number) => number;
		repaymentInterest: (
			interestRemaining: number,
			interestPaid: number,
		) => number;
	};
};
