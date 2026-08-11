"use client";

import { type ReactNode, useEffect, useMemo, useTransition } from "react";
import { toast } from "sonner";
import { recordPaymentAction } from "@/features/loans/actions";
import { Button } from "@/shared/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/shared/components/ui/dialog";
import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { useControlledState } from "@/shared/hooks/use-controlled-state";
import { useFormState } from "@/shared/hooks/use-form-state";
import { formatCurrency, normalizeDecimalInput } from "@/shared/utils/currency";
import { formatDate, toDateOnlyString } from "@/shared/utils/date";

import type { LoanDashboardAccount } from "../lib/dashboard";
import { allocatePaymentComponents } from "../lib/payment-allocation";

type LoanPaymentFormValues = {
	installmentId: string;
	amount: string;
	principalPaid: string;
	interestPaid: string;
	chargePaid: string;
	paidAt: string;
	status: "partial" | "paid";
};

interface LoanPaymentDialogProps {
	trigger?: ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	onSuccess?: () => void;
	account: LoanDashboardAccount | null;
	installmentId?: string | null;
}

function parseDecimal(value: string) {
	const normalized = normalizeDecimalInput(value).trim();
	if (!normalized) return 0;
	const parsed = Number(normalized);
	return Number.isFinite(parsed) ? parsed : Number.NaN;
}

function getInstallmentSummary(
	account: LoanDashboardAccount,
	installmentId: string,
) {
	const installment = account.installments.find(
		(item) => item.id === installmentId,
	);
	if (!installment) return null;

	const payments = account.payments.filter(
		(payment) => payment.installmentId === installmentId,
	);
	const paidAmount = payments.reduce((sum, payment) => sum + payment.amount, 0);
	const paidPrincipal = payments.reduce(
		(sum, payment) => sum + payment.principalPaid,
		0,
	);
	const paidInterest = payments.reduce(
		(sum, payment) => sum + payment.interestPaid,
		0,
	);
	const paidCharge = payments.reduce(
		(sum, payment) => sum + payment.chargePaid,
		0,
	);
	const remainingValue = Math.max(0, installment.expectedValue - paidAmount);
	const remainingPrincipal = Math.max(
		0,
		installment.expectedPrincipal - paidPrincipal,
	);
	const remainingInterest = Math.max(
		0,
		installment.expectedInterest - paidInterest,
	);
	const remainingCharge = Math.max(
		0,
		installment.expectedValue -
			installment.expectedPrincipal -
			installment.expectedInterest -
			paidCharge,
	);

	return {
		installment,
		paidAmount,
		paidPrincipal,
		paidInterest,
		paidCharge,
		remainingValue,
		remainingPrincipal,
		remainingInterest,
		remainingCharge,
	};
}

function buildInitialValues(
	account: LoanDashboardAccount | null,
	preferredInstallmentId?: string | null,
): LoanPaymentFormValues {
	const today = toDateOnlyString(new Date()) ?? "";
	const installmentId =
		preferredInstallmentId ??
		account?.installments.find((installment) => installment.status !== "paid")
			?.id ??
		account?.installments[0]?.id ??
		"";
	const summary =
		account && installmentId
			? getInstallmentSummary(account, installmentId)
			: null;

	return {
		installmentId,
		amount: summary ? summary.remainingValue.toFixed(2) : "",
		principalPaid: summary ? summary.remainingPrincipal.toFixed(2) : "",
		interestPaid: summary ? summary.remainingInterest.toFixed(2) : "",
		chargePaid: summary ? summary.remainingCharge.toFixed(2) : "",
		paidAt: today,
		status: summary && summary.remainingValue <= 0 ? "paid" : "partial",
	};
}

export function LoanPaymentDialog({
	trigger,
	open,
	onOpenChange,
	onSuccess,
	account,
	installmentId,
}: LoanPaymentDialogProps) {
	const [isPending, startTransition] = useTransition();
	const [dialogOpen, setDialogOpen] = useControlledState(
		open,
		false,
		onOpenChange,
	);

	const initialState = useMemo(
		() => buildInitialValues(account, installmentId),
		[account, installmentId],
	);
	const { formState, resetForm, updateField } =
		useFormState<LoanPaymentFormValues>(initialState);

	useEffect(() => {
		if (dialogOpen) {
			resetForm(initialState);
		}
	}, [dialogOpen, initialState, resetForm]);

	const selectedInstallment =
		account?.installments.find((item) => item.id === formState.installmentId) ??
		null;
	const summary =
		account && formState.installmentId
			? getInstallmentSummary(account, formState.installmentId)
			: null;

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		if (!account) {
			toast.error("Selecione uma conta de empréstimo.");
			return;
		}

		if (!formState.installmentId) {
			toast.error("Selecione uma parcela.");
			return;
		}

		const amount = parseDecimal(formState.amount);
		const paidAt = formState.paidAt
			? new Date(`${formState.paidAt}T00:00:00.000Z`)
			: null;

		if (!Number.isFinite(amount) || amount <= 0) {
			toast.error("Informe o valor pago.");
			return;
		}

		if (!paidAt || Number.isNaN(paidAt.getTime())) {
			toast.error("Informe a data do pagamento.");
			return;
		}

		if (!summary) {
			toast.error("Selecione uma parcela válida.");
			return;
		}

		if (amount > summary.remainingValue + 0.005) {
			toast.error(
				"O pagamento não pode ser maior que o saldo restante da parcela.",
			);
			return;
		}

		const allocation = allocatePaymentComponents({
			amount,
			remainingPrincipal: summary.remainingPrincipal,
			remainingInterest: summary.remainingInterest,
			remainingCharge: summary.remainingCharge,
		});

		startTransition(async () => {
			try {
				const result = await recordPaymentAction({
					installmentId: formState.installmentId,
					amount: allocation.amount,
					principalPaid: allocation.principalPaid,
					interestPaid: allocation.interestPaid,
					chargePaid: allocation.chargePaid,
					paidAt,
					status: formState.status,
				});

				if (result.success) {
					toast.success(result.message);
					setDialogOpen(false);
					onSuccess?.();
					return;
				}

				toast.error(result.error);
			} catch {
				toast.error("Algo deu errado");
			}
		});
	};

	return (
		<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
			{trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
			<DialogContent className="sm:max-w-2xl">
				<DialogHeader>
					<DialogTitle>Registrar pagamento</DialogTitle>
					<DialogDescription>
						Registre a parcela paga e informe como o valor se divide entre
						principal, juros e encargos.
					</DialogDescription>
				</DialogHeader>

				<form className="space-y-5" onSubmit={handleSubmit}>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2 sm:col-span-2">
							<Label htmlFor="payment-installment">Parcela</Label>
							<Select
								value={formState.installmentId}
								onValueChange={(value) => updateField("installmentId", value)}
								disabled={!account || account.installments.length === 0}
							>
								<SelectTrigger id="payment-installment" className="w-full">
									<SelectValue placeholder="Selecione a parcela" />
								</SelectTrigger>
								<SelectContent>
									{account?.installments.map((installment) => (
										<SelectItem key={installment.id} value={installment.id}>
											Parcela {installment.installmentNumber} ·{" "}
											{formatDate(installment.dueDate)}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>

						<div className="space-y-2">
							<Label htmlFor="payment-amount">Valor pago</Label>
							<Input
								id="payment-amount"
								value={formState.amount}
								onChange={(event) => updateField("amount", event.target.value)}
								placeholder="250,00"
								inputMode="decimal"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="payment-date">Data</Label>
							<Input
								id="payment-date"
								type="date"
								value={formState.paidAt}
								onChange={(event) => updateField("paidAt", event.target.value)}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="payment-principal">Principal amortizado</Label>
							<Input
								id="payment-principal"
								value={formState.principalPaid}
								onChange={(event) =>
									updateField("principalPaid", event.target.value)
								}
								placeholder="200,00"
								inputMode="decimal"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="payment-interest">Juros pagos</Label>
							<Input
								id="payment-interest"
								value={formState.interestPaid}
								onChange={(event) =>
									updateField("interestPaid", event.target.value)
								}
								placeholder="50,00"
								inputMode="decimal"
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="payment-charge">Encargos pagos</Label>
							<Input
								id="payment-charge"
								value={formState.chargePaid}
								onChange={(event) =>
									updateField("chargePaid", event.target.value)
								}
								placeholder="0,00"
								inputMode="decimal"
							/>
						</div>
						<div className="space-y-2 sm:col-span-2">
							<Label htmlFor="payment-status">Status</Label>
							<Select
								value={formState.status}
								onValueChange={(value) =>
									updateField(
										"status",
										value as LoanPaymentFormValues["status"],
									)
								}
							>
								<SelectTrigger id="payment-status" className="w-full">
									<SelectValue placeholder="Selecione o status" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="paid">Pago</SelectItem>
									<SelectItem value="partial">Parcial</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="rounded-xl border bg-muted/20 p-4 text-sm text-muted-foreground">
						<p className="font-medium text-foreground">
							{selectedInstallment
								? `Parcela ${selectedInstallment.installmentNumber} · ${formatCurrency(selectedInstallment.expectedValue)}`
								: "Selecione uma parcela"}
						</p>
						<p className="mt-1">
							Principal restante{" "}
							{formatCurrency(summary?.remainingPrincipal ?? 0)} · Juros
							restantes {formatCurrency(summary?.remainingInterest ?? 0)} ·
							Encargos restantes {formatCurrency(summary?.remainingCharge ?? 0)}
						</p>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setDialogOpen(false)}
							disabled={isPending}
						>
							Cancelar
						</Button>
						<Button
							type="submit"
							disabled={isPending || !account?.installments.length}
						>
							{isPending ? "Salvando..." : "Salvar pagamento"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
