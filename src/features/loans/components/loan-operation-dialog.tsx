"use client";

import {
	type FormEvent,
	type ReactNode,
	useEffect,
	useMemo,
	useTransition,
} from "react";
import { toast } from "sonner";
import {
	createInstallmentAction,
	createLoanOperationAction,
} from "@/features/loans/actions";
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
import { formatCurrency } from "@/shared/utils/currency";
import { formatDateOnly } from "@/shared/utils/date";
import {
	buildLoanInstallmentPlan,
	type LoanInstallmentDraft,
} from "../lib/dashboard";
import {
	buildLoanOperationInitialValues,
	buildLoanOperationPreview,
	type LoanOperationFormValues,
	parseLoanOperationFormValues,
} from "../lib/form-values";
import type { LoanInstitution, LoanType } from "../types";

interface LoanOperationDialogProps {
	trigger?: ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	onSuccess?: () => void;
	institutions: LoanInstitution[];
	defaultInstitutionId?: string | null;
	defaultLoanType?: LoanType;
}

const buildInitialValues = ({
	defaultInstitutionId,
	defaultLoanType,
}: {
	defaultInstitutionId?: string | null;
	defaultLoanType?: LoanType;
}): LoanOperationFormValues =>
	buildLoanOperationInitialValues({
		institutionId: defaultInstitutionId,
		loanType: defaultLoanType,
	});

async function generateInstallments(
	loanOperationId: string,
	drafts: LoanInstallmentDraft[],
) {
	for (const draft of drafts) {
		const result = await createInstallmentAction({
			loanOperationId,
			installmentNumber: draft.installmentNumber,
			dueDate: draft.dueDate,
			expectedValue: draft.expectedValue,
			expectedPrincipal: draft.expectedPrincipal,
			expectedInterest: draft.expectedInterest,
			status: "pending",
		});

		if (!result.success) {
			throw new Error(result.error);
		}
	}
}

export function LoanOperationDialog({
	trigger,
	open,
	onOpenChange,
	onSuccess,
	institutions,
	defaultInstitutionId,
	defaultLoanType,
}: LoanOperationDialogProps) {
	const [isPending, startTransition] = useTransition();
	const [dialogOpen, setDialogOpen] = useControlledState(
		open,
		false,
		onOpenChange,
	);

	const initialState = useMemo(
		() =>
			buildInitialValues({
				defaultInstitutionId,
				defaultLoanType,
			}),
		[defaultInstitutionId, defaultLoanType],
	);

	const { formState, resetForm, updateField } =
		useFormState<LoanOperationFormValues>(initialState);
	const preview = useMemo(
		() => buildLoanOperationPreview(formState),
		[formState],
	);

	useEffect(() => {
		if (dialogOpen) {
			resetForm(initialState);
		}
	}, [dialogOpen, initialState, resetForm]);

	const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const parsedValues = parseLoanOperationFormValues(formState);
		if (!parsedValues.ok) {
			toast.error(parsedValues.error);
			return;
		}

		const { data } = parsedValues;
		const drafts = buildLoanInstallmentPlan({
			principalBorrowed: data.principalBorrowed,
			totalInterest: data.totalInterest,
			totalCharge: data.totalCharge,
			totalPayable: data.totalPayable,
			totalInstallments: data.totalInstallments,
			firstDueDate: data.nextDueDate,
		});

		startTransition(async () => {
			try {
				const result = await createLoanOperationAction(data);

				if (!result.success || !result.loanOperationId) {
					toast.error(result.error);
					return;
				}

				try {
					await generateInstallments(result.loanOperationId, drafts);
					toast.success("Operação criada com sucesso.");
					setDialogOpen(false);
					onSuccess?.();
				} catch (error) {
					const message =
						error instanceof Error ? error.message : "Algo deu errado";
					toast.error(message);
				}
			} catch {
				toast.error("Algo deu errado");
			}
		});
	};

	const selectedInstitution =
		institutions.find(
			(institution) => institution.id === formState.institutionId,
		) ?? institutions[0];
	const primaryAmountLabel =
		formState.loanType === "revolving"
			? "Limite concedido"
			: "Valor contratado";

	return (
		<Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
			{trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Nova operação</DialogTitle>
					<DialogDescription>
						Cadastre uma operação de crédito rotativo ou empréstimo fixo com os
						dados que você realmente conhece na contratação.
					</DialogDescription>
				</DialogHeader>

				<form className="space-y-5" onSubmit={handleSubmit}>
					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="loan-institution">Instituição</Label>
							<Select
								value={formState.institutionId}
								onValueChange={(value) => updateField("institutionId", value)}
								disabled={institutions.length === 0}
							>
								<SelectTrigger id="loan-institution" className="w-full">
									<SelectValue placeholder="Selecione uma instituição" />
								</SelectTrigger>
								<SelectContent>
									{institutions.map((institution) => (
										<SelectItem key={institution.id} value={institution.id}>
											{institution.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{institutions.length === 0 ? (
								<p className="text-xs text-muted-foreground">
									Crie uma conta / linha antes de cadastrar a operação.
								</p>
							) : null}
						</div>

						<div className="space-y-2">
							<Label htmlFor="loan-type">Modalidade</Label>
							<Select
								value={formState.loanType}
								onValueChange={(value) =>
									updateField("loanType", value as LoanType)
								}
							>
								<SelectTrigger id="loan-type" className="w-full">
									<SelectValue placeholder="Selecione a modalidade" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="revolving">Crédito rotativo</SelectItem>
									<SelectItem value="fixed">Empréstimo fixo</SelectItem>
								</SelectContent>
							</Select>
						</div>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="primary-amount">{primaryAmountLabel}</Label>
							<Input
								id="primary-amount"
								value={formState.primaryAmount}
								onChange={(event) =>
									updateField("primaryAmount", event.target.value)
								}
								placeholder="0,00"
								inputMode="decimal"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="installment-value">Valor da parcela</Label>
							<Input
								id="installment-value"
								value={formState.installmentValue}
								onChange={(event) =>
									updateField("installmentValue", event.target.value)
								}
								placeholder="0,00"
								inputMode="decimal"
							/>
						</div>
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="total-installments">Número de parcelas</Label>
							<Input
								id="total-installments"
								type="number"
								min={1}
								value={formState.totalInstallments}
								onChange={(event) =>
									updateField("totalInstallments", event.target.value)
								}
								placeholder="1"
							/>
						</div>

						<div className="space-y-2">
							<Label htmlFor="next-due-date">Primeiro vencimento</Label>
							<Input
								id="next-due-date"
								type="date"
								value={formState.nextDueDate}
								onChange={(event) =>
									updateField("nextDueDate", event.target.value)
								}
							/>
						</div>
					</div>

					<div className="grid gap-3 rounded-xl border bg-muted/20 p-4 sm:grid-cols-3">
						<div className="space-y-1">
							<p className="text-xs uppercase tracking-wide text-muted-foreground">
								Total a pagar
							</p>
							<p className="text-lg font-semibold">
								{preview ? formatCurrency(preview.totalPayable) : "—"}
							</p>
						</div>
						<div className="space-y-1">
							<p className="text-xs uppercase tracking-wide text-muted-foreground">
								Custo total (juros e encargos)
							</p>
							<p
								className={
									preview && preview.financialCost < 0
										? "text-lg font-semibold text-destructive"
										: "text-lg font-semibold"
								}
							>
								{preview ? formatCurrency(preview.financialCost) : "—"}
							</p>
						</div>
						<div className="space-y-1">
							<p className="text-xs uppercase tracking-wide text-muted-foreground">
								Último vencimento
							</p>
							<p className="text-lg font-semibold">
								{preview ? (formatDateOnly(preview.finalDueDate) ?? "—") : "—"}
							</p>
						</div>
					</div>

					{preview && preview.financialCost < 0 ? (
						<p className="text-sm text-destructive">
							O total a pagar não pode ser menor que o valor principal
							informado.
						</p>
					) : null}

					<div className="rounded-xl border bg-muted/10 p-4 text-sm text-muted-foreground">
						<p className="font-medium text-foreground">
							{selectedInstitution
								? selectedInstitution.name
								: "Nenhuma instituição selecionada"}
						</p>
						<p className="mt-1">
							As parcelas serão geradas automaticamente após salvar a operação.
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
							disabled={isPending || institutions.length === 0}
						>
							{isPending ? "Salvando..." : "Salvar operação"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
