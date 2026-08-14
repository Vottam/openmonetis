"use client";

import {
	RiAddLine,
	RiArrowLeftSLine,
	RiArrowRightLine,
	RiCalendarEventLine,
	RiCloseLine,
	RiDeleteBin5Line,
	RiPencilLine,
	RiToggleLine,
} from "@remixicon/react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { CategoryIcon } from "@/features/categories/components/category-icon";
import { MonthlyOccurrenceCard } from "@/features/payables/components/MonthlyOccurrenceCard";
import { MonthlyPeriodSelector } from "@/features/payables/components/MonthlyPeriodSelector";
import { MonthlySummary } from "@/features/payables/components/MonthlySummary";
import { PayablesCompactPage } from "@/features/payables/components/payables-compact-page";
import type { MonthlyPayableOccurrence } from "@/features/payables/lib/monthly-read-model";
import {
	buildHistoricalPayableOccurrences,
	buildMonthlyPayableOccurrences,
	buildOperationalMonthlyPayableOccurrences,
	buildUpcomingMonthlyPayableOccurrences,
	computeMonthlySummary,
	sortMonthlyPayableOccurrences,
	sortMonthlyPayableOccurrencesChronologically,
	isOccurrenceVisibleForPayable,
} from "@/features/payables/lib/monthly-read-model";
import { useMonthlyPeriod } from "@/features/payables/lib/use-monthly-period";
import {
	buildInformAmountInputValue,
	buildPayableHistoryHref,
	buildPayableOccurrenceDetailFields,
	buildPayableTemplateFields,
	formatPayableRecurrenceLabel,
	getPayableLifecycleActionLabel,
	getPayableLifecycleLabel,
	getPayableLifecycleState,
	PAYABLE_RECURRENCE_OPTIONS,
} from "@/features/payables/lib/page-ux";
import { PAYMENT_METHODS } from "@/features/transactions/lib/constants";
import { ConfirmActionDialog } from "@/shared/components/confirm-action-dialog";
import { EmptyState } from "@/shared/components/feedback/empty-state";
import { Badge } from "@/shared/components/ui/badge";
import { Button } from "@/shared/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
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
import { normalizeDecimalInput, parseMoneyInput } from "@/shared/utils/currency";
import { formatFinancialDateLabel } from "@/shared/utils/financial-dates";
import { cn } from "@/shared/utils/ui";
import {
	cancelPayableAction,
	createPayableAction,
	createPayablePaymentAction,
	deletePayableAction,
	informOccurrenceAmountAction,
	updatePayableAction,
	updatePayableOccurrenceAction,
} from "./actions";
import type {
	Payable,
	PayableOccurrence,
	PayablePaymentFormState,
	PayableRecurrenceType,
	PayablesPageData,
	PayableWithOccurrences,
} from "./lib/types";

const DATE_FORMAT: Intl.DateTimeFormatOptions = {
	day: "2-digit",
	month: "2-digit",
	year: "numeric",
};

const OCCURRENCE_STATUS_LABELS: Record<PayableOccurrence["status"], string> = {
	scheduled: "Agendada",
	awaiting_amount: "Aguardando valor",
	pending: "Pendente",
	partial: "Parcial",
	paid: "Paga",
	cancelled: "Inativa",
};

const BADGE_VARIANT: Record<
	PayableOccurrence["status"] | Payable["status"] | "overdue",
	"default" | "outline" | "destructive" | "secondary"
> = {
	active: "outline",
	cancelled: "destructive",
	scheduled: "secondary",
	awaiting_amount: "secondary",
	pending: "outline",
	partial: "default",
	paid: "default",
	overdue: "destructive",
};

type PayableFormState = {
	description: string;
	supplierName: string;
	categoryId: string;
	recurrenceType: PayableRecurrenceType;
	defaultAmount: string;
	startsAt: string;
	endsAt: string;
};

function toInputDate(value: string | null | undefined): string {
	return value?.slice(0, 10) ?? "";
}

function formatDateOnly(value: string | null | undefined): string {
	if (!value) {
		return "—";
	}

	const [year, month, day] = value.split("-");
	if (!year || !month || !day) {
		return value;
	}

	return `${day}/${month}/${year}`;
}

function formatMoneyValue(value: number | null | undefined): string {
	return value === null || value === undefined
		? ""
		: new Intl.NumberFormat("pt-BR", {
				style: "currency",
				currency: "BRL",
			}).format(value);
}

function formatOccurrenceTitle(
	occurrence: PayableOccurrence,
	payable?: Payable,
): string {
	// Valor estimado: monthly_variable com expectedAmount mas sem actualAmount
	const isEstimated =
		payable?.recurrenceType === "monthly_variable" &&
		occurrence.expectedAmount !== null &&
		occurrence.actualAmount === null;

	if (occurrence.status === "awaiting_amount") {
		if (isEstimated) {
			return `${formatMoneyValue(occurrence.expectedAmount)} (Estimado)`;
		}
		return "Aguardando valor";
	}

	if (isEstimated) {
		return `${formatMoneyValue(occurrence.expectedAmount)} (Estimado)`;
	}

	if (occurrence.expectedAmount !== null) {
		return formatMoneyValue(occurrence.expectedAmount);
	}

	if (occurrence.actualAmount !== null) {
		return formatMoneyValue(occurrence.actualAmount);
	}

	return "Sem valor";
}

function buildPaymentFormState(
	occurrence: PayableOccurrence | null,
	data: PayablesPageData,
): PayablePaymentFormState {
	const defaultAmount =
		occurrence?.remainingAmount ?? occurrence?.expectedAmount ?? 0;
	return {
		amount: defaultAmount > 0 ? String(defaultAmount) : "",
		paymentMethod: "Pix",
		accountId: data.accountOptions[0]?.value ?? "",
		cardId: data.cardOptions[0]?.value ?? "",
		paidAt: data.today,
		idempotencyKey: globalThis.crypto.randomUUID(),
	};
}

function buildOccurrenceEditFormState(occurrence: PayableOccurrence | null) {
	const amount =
		occurrence?.actualAmount ?? occurrence?.expectedAmount ?? occurrence?.remainingAmount ?? null;
	return {
		dueDate: occurrence?.dueDate ?? "",
		actualAmount: amount === null ? "" : buildInformAmountInputValue({
			expectedAmount: occurrence?.expectedAmount ?? null,
			actualAmount: amount,
			remainingAmount: occurrence?.remainingAmount ?? null,
		}),
	};
}

function buildInitialFormState(
	payable?: PayableWithOccurrences | null,
): PayableFormState {
	return {
		description: payable?.payable.description ?? "",
		supplierName: payable?.payable.supplierName ?? "",
		categoryId: payable?.payable.categoryId ?? "",
		recurrenceType: payable?.payable.recurrenceType ?? "once",
		defaultAmount:
			payable?.payable.defaultAmount !== null &&
			payable?.payable.defaultAmount !== undefined
				? String(payable.payable.defaultAmount)
				: "",
		startsAt: toInputDate(payable?.payable.startsAt),
		endsAt: toInputDate(payable?.payable.endsAt),
	};
}

function statusBadgeVariant(
	status: PayableOccurrence["status"] | Payable["status"] | "overdue",
) {
	return BADGE_VARIANT[status];
}

function payableOccurrenceVisualStatus(occurrence: PayableOccurrence) {
	if (occurrence.status === "pending" && occurrence.isOverdue) {
		return "overdue" as const;
	}
	return occurrence.status;
}

function summaryOrder(payable: PayableWithOccurrences) {
	const openOccurrences = payable.occurrences.filter(
		(occurrence) =>
			occurrence.status !== "cancelled" && occurrence.status !== "paid",
	);
	const overdueCount = openOccurrences.filter(
		(occurrence) => occurrence.isOverdue,
	).length;
	const awaitingCount = openOccurrences.filter(
		(occurrence) => occurrence.status === "awaiting_amount",
	).length;
	const nextDue = openOccurrences
		.slice()
		.sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];

	return [
		payable.payable.status === "cancelled" ? 2 : 0,
		-overdueCount,
		-awaitingCount,
		nextDue?.dueDate ?? "9999-12-31",
		payable.payable.description.toLowerCase(),
	] as const;
}

function PayableFormDialog({
	open,
	mode,
	payable,
	categories,
	onOpenChange,
	onSaved,
}: {
	open: boolean;
	mode: "create" | "update";
	payable?: PayableWithOccurrences | null;
	categories: PayablesPageData["categories"];
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const [isPending, startTransition] = useTransition();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const [form, setForm] = useState<PayableFormState>(() =>
		buildInitialFormState(payable ?? null),
	);

	useEffect(() => {
		if (!open) {
			return;
		}
		setForm(buildInitialFormState(payable ?? null));
		setErrorMessage(null);
	}, [open, payable]);

	const amountRequired = form.recurrenceType !== "monthly_variable";
	const showEstimatedAmount = form.recurrenceType === "monthly_variable";
	const showEndsAt = form.recurrenceType !== "once";
	const dueDateLabel =
		form.recurrenceType === "once" ? "Vencimento" : "Primeiro vencimento";

	const submit = async () => {
		const startsAt = form.startsAt;
		if (!form.description.trim()) {
			setErrorMessage("Informe a descrição.");
			return;
		}
		if (!form.supplierName.trim()) {
			setErrorMessage("Informe o fornecedor.");
			return;
		}
		if (!startsAt) {
			setErrorMessage("Informe a data de vencimento.");
			return;
		}

		const normalizedAmount = normalizeDecimalInput(form.defaultAmount);
		const amountValue = normalizedAmount ? Number(normalizedAmount) : null;
		if (
			amountRequired &&
			(amountValue === null ||
				!Number.isFinite(amountValue) ||
				amountValue <= 0)
		) {
			setErrorMessage("Informe um valor válido.");
			return;
		}

		const payload = {
			description: form.description.trim(),
			supplierName: form.supplierName.trim(),
			categoryId: form.categoryId || null,
			recurrenceType: form.recurrenceType,
			defaultAmount: amountValue,
			startsAt,
			endsAt: showEndsAt && form.endsAt ? form.endsAt : null,
		};

		startTransition(async () => {
			const result =
				mode === "create"
					? await createPayableAction(payload)
					: await updatePayableAction({
							id: payable?.payable.id ?? "",
							...payload,
						});

			if (!result.success) {
				setErrorMessage(result.error);
				toast.error(result.error);
				return;
			}

			toast.success(result.message);
			onOpenChange(false);
			onSaved();
		});
	};

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>
						{mode === "create" ? "Nova conta a pagar" : "Editar conta a pagar"}
					</DialogTitle>
					<DialogDescription>
						{mode === "create"
							? "Cadastre uma obrigação pontual ou recorrente sem criar transactions."
							: "Atualize os dados do template selecionado."}
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2 md:col-span-2">
						<Label htmlFor="payable-description">Descrição</Label>
						<Input
							id="payable-description"
							value={form.description}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									description: event.target.value,
								}))
							}
							placeholder="Ex.: Aluguel"
						/>
					</div>

					<div className="space-y-2 md:col-span-2">
						<Label htmlFor="payable-supplier">Fornecedor</Label>
						<Input
							id="payable-supplier"
							value={form.supplierName}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									supplierName: event.target.value,
								}))
							}
							placeholder="Ex.: Loja X"
						/>
					</div>

					<div className="space-y-2">
						<Label>Categoria</Label>
						<Select
							value={form.categoryId || "none"}
							onValueChange={(value) =>
								setForm((current) => ({
									...current,
									categoryId: value === "none" ? "" : value,
								}))
							}
						>
							<SelectTrigger>
								<SelectValue placeholder="Opcional" />
							</SelectTrigger>
							<SelectContent>
								<SelectItem value="none">Sem categoria</SelectItem>
								{categories.map((category) => (
									<SelectItem key={category.value} value={category.value}>
										{category.label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					<div className="space-y-2">
						<Label>Tipo</Label>
						<Select
							value={form.recurrenceType}
							onValueChange={(value) =>
								setForm((current) => ({
									...current,
									recurrenceType: value as PayableRecurrenceType,
									defaultAmount:
										value === "monthly_variable" ? "" : current.defaultAmount,
								}))
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{PAYABLE_RECURRENCE_OPTIONS.map(([value, label]) => (
									<SelectItem key={value} value={value}>
										{label}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>

					{amountRequired ? (
						<div className="space-y-2">
							<Label htmlFor="payable-amount">Valor</Label>
							<Input
								id="payable-amount"
								value={form.defaultAmount}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										defaultAmount: event.target.value,
									}))
								}
								placeholder="0,00"
							/>
						</div>
					) : null}
					{showEstimatedAmount ? (
						<div className="space-y-2">
							<Label htmlFor="payable-estimated-amount">Valor estimado</Label>
							<Input
								id="payable-estimated-amount"
								value={form.defaultAmount}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										defaultAmount: event.target.value,
									}))
								}
								placeholder="0,00"
							/>
							<p className="text-xs text-muted-foreground">
								Valor usado como previsão para competências futuras. Poderá ser
								ajustado quando o valor real chegar.
							</p>
						</div>
					) : null}

					<div className="space-y-2">
						<Label htmlFor="payable-starts-at">{dueDateLabel}</Label>
						<Input
							id="payable-starts-at"
							type="date"
							value={form.startsAt}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									startsAt: event.target.value,
								}))
							}
						/>
					</div>

					{showEndsAt ? (
						<div className="space-y-2">
							<Label htmlFor="payable-ends-at">Até opcional</Label>
							<Input
								id="payable-ends-at"
								type="date"
								value={form.endsAt}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										endsAt: event.target.value,
									}))
								}
							/>
						</div>
					) : null}
				</div>

				{errorMessage ? (
					<p className="text-sm text-destructive">{errorMessage}</p>
				) : null}

				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancelar
					</Button>
					<Button
						type="button"
						onClick={() => void submit()}
						disabled={isPending}
					>
						{isPending ? "Salvando..." : mode === "create" ? "Criar" : "Salvar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function PayableDetailDialog({
	open,
	payable,
	onOpenChange,
	onEdit,
	onCancel,
	onDelete,
	onInformAmount,
	onPay,
}: {
	open: boolean;
	payable: PayableWithOccurrences | null;
	onOpenChange: (open: boolean) => void;
	onEdit: (payable: PayableWithOccurrences) => void;
	onCancel: (payable: PayableWithOccurrences) => void;
	onDelete: (payable: PayableWithOccurrences) => void;
	onInformAmount: (occurrence: PayableOccurrence) => void;
	onPay: (occurrence: PayableOccurrence) => void;
}) {
	if (!payable) {
		return null;
	}

	const openOccurrences = payable.occurrences
		.filter((occurrence) =>
			isOccurrenceVisibleForPayable(payable.payable, occurrence),
		)
		.filter((occurrence) => occurrence.status !== "cancelled")
		.sort((left, right) =>
			left.period.localeCompare(right.period) ||
			left.dueDate.localeCompare(right.dueDate),
		);
	const lifecycleState = getPayableLifecycleState(payable.payable);

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>{payable.payable.description}</DialogTitle>
					<DialogDescription>
						{payable.payable.supplierName}
						{payable.payable.categoryName
							? ` · ${payable.payable.categoryName}`
							: ""}
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4 md:grid-cols-2">
					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-base">Resumo do template</CardTitle>
							<CardDescription>
								{formatPayableRecurrenceLabel(payable.payable.recurrenceType)} ·{" "}
								{getPayableLifecycleLabel(payable.payable)}
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-2 text-sm">
							{buildPayableTemplateFields(payable.payable).map((field) => (
								<div key={field.label} className="flex items-center justify-between gap-3">
									<span className="text-muted-foreground">{field.label}</span>
									<span className="font-medium">{field.value}</span>
								</div>
							))}
						</CardContent>
					</Card>

					<Card>
						<CardHeader className="pb-3">
							<CardTitle className="text-base">Ocorrências</CardTitle>
							<CardDescription>
								{openOccurrences.length} ocorrências visíveis no horizonte
							</CardDescription>
						</CardHeader>
						<CardContent className="space-y-3">
							{openOccurrences.length === 0 ? (
								<p className="text-sm text-muted-foreground">Nenhuma ocorrência no horizonte.</p>
							) : (
								openOccurrences.map((occurrence) => {
									const visualStatus = payableOccurrenceVisualStatus(occurrence);
									const isEstimated =
										payable.payable.recurrenceType === "monthly_variable" &&
										occurrence.expectedAmount !== null &&
										occurrence.actualAmount === null;
									const detailFields = buildPayableOccurrenceDetailFields({
										payable: payable.payable,
										occurrence,
									} as MonthlyPayableOccurrence);

									return (
										<div key={occurrence.id} className="space-y-3 rounded-lg border p-3">
											<div className="flex flex-wrap items-start justify-between gap-3">
												<div className="space-y-1">
													<div className="flex flex-wrap items-center gap-2">
														<span className="text-sm font-medium">{occurrence.period}</span>
														<Badge variant={statusBadgeVariant(visualStatus)}>
															{visualStatus === "overdue"
																? "Vencida"
																: OCCURRENCE_STATUS_LABELS[occurrence.status]}
														</Badge>
														{isEstimated ? (
															<Badge variant="secondary" className="border-info/30 bg-info/10 text-info">
																Estimado
															</Badge>
														) : null}
													</div>
													<p className="text-xs text-muted-foreground">
														{formatFinancialDateLabel(occurrence.dueDate, "Vence em", DATE_FORMAT)}
													</p>
													<p className="text-sm font-medium">{formatOccurrenceTitle(occurrence, payable.payable)}</p>
												</div>
												<div className="flex flex-wrap gap-2">
													{occurrence.status === "awaiting_amount" ? (
														<Button type="button" size="sm" variant="outline" onClick={() => onInformAmount(occurrence)}>
															Informar valor
														</Button>
													) : null}
													{isEstimated ? (
														<Button type="button" size="sm" variant="outline" onClick={() => onInformAmount(occurrence)} title="Informar valor real desta competência">
															Atualizar valor
														</Button>
													) : null}
													{occurrence.status === "pending" || occurrence.status === "partial" ? (
														<Button type="button" size="sm" variant="default" onClick={() => onPay(occurrence)}>
															Pagar
														</Button>
													) : null}
												</div>
											</div>
											<dl className="grid gap-x-4 gap-y-2 text-xs text-muted-foreground sm:grid-cols-2">
												{detailFields.map((field) => (
													<div key={field.label} className="space-y-0.5">
														<dt className="font-medium text-foreground">{field.label}</dt>
														<dd>{field.value}</dd>
													</div>
												))}
											</dl>
										</div>
									);
								})
							)}
						</CardContent>
					</Card>
				</div>

				<DialogFooter className="gap-2 sm:justify-between">
					<div className="flex gap-2">
						<Button type="button" variant="outline" onClick={() => onEdit(payable)}>
							<RiPencilLine className="size-4" />
							Editar
						</Button>
						{lifecycleState === "expired" ? (
							<Button type="button" variant="outline" onClick={() => onEdit(payable)}>
								<RiArrowRightLine className="size-4" />
								Renovar
							</Button>
						) : (
							<Button type="button" variant="outline" onClick={() => onCancel(payable)}>
								<RiCloseLine className="size-4" />
								{getPayableLifecycleActionLabel(payable.payable)}
							</Button>
						)}
					</div>
					<Button type="button" variant="destructive" onClick={() => onDelete(payable)}>
						<RiDeleteBin5Line className="size-4" />
						Excluir
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function PayablePaymentDialog({
	open,
	occurrence,
	payable,
	data,
	onOpenChange,
	onSaved,
}: {
	open: boolean;
	occurrence: PayableOccurrence | null;
	payable: PayableWithOccurrences | null;
	data: PayablesPageData;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const [form, setForm] = useState<PayablePaymentFormState>(() =>
		buildPaymentFormState(occurrence, data),
	);
	const [isPending, startTransition] = useTransition();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const visible = open && !!occurrence && !!payable;

	useEffect(() => {
		if (visible) {
			setForm(buildPaymentFormState(occurrence, data));
			setErrorMessage(null);
		}
	}, [visible, occurrence, data]);

	const submit = async () => {
		const normalizedAmount = normalizeDecimalInput(form.amount);
		const amount = normalizedAmount ? Number(normalizedAmount) : NaN;
		if (!Number.isFinite(amount) || amount <= 0) {
			setErrorMessage("Informe um valor válido.");
			return;
		}

		startTransition(async () => {
			const result = await createPayablePaymentAction({
				occurrenceId: occurrence?.id ?? "",
				amount,
				paymentMethod: form.paymentMethod,
				accountId:
					form.paymentMethod === "Cartão de crédito"
						? null
						: form.accountId || null,
				cardId:
					form.paymentMethod === "Cartão de crédito"
						? form.cardId || null
						: null,
				paidAt: form.paidAt,
				idempotencyKey: form.idempotencyKey,
			});

			if (!result.success) {
				setErrorMessage(result.error);
				toast.error(result.error);
				return;
			}

			toast.success(result.message);
			onSaved();
			onOpenChange(false);
		});
	};

	const usingCard = form.paymentMethod === "Cartão de crédito";

	return (
		<Dialog open={visible} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Pagar conta</DialogTitle>
					<DialogDescription>
						{payable ? payable.payable.description : "Conta a pagar"} ·{" "}
						{occurrence?.period}
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4 md:grid-cols-2">
					<div className="space-y-2 md:col-span-2">
						<Label htmlFor="payable-payment-amount">Valor</Label>
						<Input
							id="payable-payment-amount"
							value={form.amount}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									amount: event.target.value,
								}))
							}
							placeholder="0,00"
						/>
					</div>
					<div className="space-y-2">
						<Label>Forma de pagamento</Label>
						<Select
							value={form.paymentMethod}
							onValueChange={(value) =>
								setForm((current) => ({ ...current, paymentMethod: value }))
							}
						>
							<SelectTrigger>
								<SelectValue />
							</SelectTrigger>
							<SelectContent>
								{PAYMENT_METHODS.map((method) => (
									<SelectItem key={method} value={method}>
										{method}
									</SelectItem>
								))}
							</SelectContent>
						</Select>
					</div>
					{usingCard ? (
						<div className="space-y-2">
							<Label>Cartão</Label>
							<Select
								value={form.cardId || "none"}
								onValueChange={(value) =>
									setForm((current) => ({
										...current,
										cardId: value === "none" ? "" : value,
									}))
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="Selecione" />
								</SelectTrigger>
								<SelectContent>
									{data.cardOptions.map((card) => (
										<SelectItem key={card.value} value={card.value}>
											{card.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					) : (
						<div className="space-y-2">
							<Label>Conta</Label>
							<Select
								value={form.accountId || "none"}
								onValueChange={(value) =>
									setForm((current) => ({
										...current,
										accountId: value === "none" ? "" : value,
									}))
								}
							>
								<SelectTrigger>
									<SelectValue placeholder="Selecione" />
								</SelectTrigger>
								<SelectContent>
									{data.accountOptions.map((account) => (
										<SelectItem key={account.value} value={account.value}>
											{account.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						</div>
					)}
					<div className="space-y-2">
						<Label htmlFor="payable-payment-date">Data</Label>
						<Input
							id="payable-payment-date"
							type="date"
							value={form.paidAt}
							onChange={(event) =>
								setForm((current) => ({
									...current,
									paidAt: event.target.value,
								}))
							}
						/>
					</div>
				</div>
				{errorMessage ? (
					<p className="text-sm text-destructive">{errorMessage}</p>
				) : null}
				<DialogFooter>
					<Button
						type="button"
						variant="outline"
						onClick={() => onOpenChange(false)}
					>
						Cancelar
					</Button>
					<Button
						type="button"
						onClick={() => void submit()}
						disabled={isPending}
					>
						{isPending ? "Salvando..." : "Pagar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function InformAmountDialog({
	open,
	occurrence,
	payable,
	onOpenChange,
	onSaved,
}: {
	open: boolean;
	occurrence: PayableOccurrence | null;
	payable: PayableWithOccurrences | null;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const [value, setValue] = useState("");
	const [isPending, startTransition] = useTransition();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const visible = open && !!occurrence && !!payable;
	const estimatedAmount = occurrence?.expectedAmount ?? occurrence?.actualAmount ?? occurrence?.remainingAmount ?? null;

	useEffect(() => {
		if (visible && occurrence) {
			setValue(buildInformAmountInputValue(occurrence));
			setErrorMessage(null);
		}
	}, [visible, occurrence]);

	const submit = async () => {
		const amount = parseMoneyInput(value);
		if (!Number.isFinite(amount ?? Number.NaN) || (amount ?? 0) <= 0) {
			setErrorMessage("Informe um valor válido.");
			return;
		}

		startTransition(async () => {
			const result = await informOccurrenceAmountAction({
				occurrenceId: occurrence?.id ?? "",
				amount,
			});

			if (!result.success) {
				setErrorMessage(result.error);
				toast.error(result.error);
				return;
			}

			toast.success(result.message);
			onSaved();
			onOpenChange(false);
		});
	};

	const detailFields = payable && occurrence
		? buildPayableOccurrenceDetailFields({ payable: payable.payable, occurrence } as MonthlyPayableOccurrence)
		: [];

	return (
		<Dialog open={visible} onOpenChange={onOpenChange}>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{occurrence?.expectedAmount !== null || occurrence?.actualAmount !== null
							? "Atualizar valor"
							: "Informar valor"}
					</DialogTitle>
					<DialogDescription>
						{payable ? payable.payable.description : "Conta a pagar"} · {occurrence?.period}
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4">
					<div className="grid gap-3 sm:grid-cols-2">
						{detailFields.map((field) => (
							<div key={field.label} className="rounded-lg border p-3 text-sm">
								<div className="text-xs uppercase text-muted-foreground">{field.label}</div>
								<div className="font-medium">{field.value}</div>
							</div>
						))}
					</div>

					<div className="space-y-2">
						<Label htmlFor="payable-amount-input">Valor real</Label>
						<Input
							id="payable-amount-input"
							value={value}
							onChange={(event) => setValue(event.target.value)}
							placeholder="0,00"
						/>
						{estimatedAmount !== null ? (
							<p className="text-xs text-muted-foreground">
								Valor atual de referência: {formatMoneyValue(estimatedAmount)}
							</p>
						) : null}
					</div>
				</div>

				{errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
						Cancelar
					</Button>
					<Button type="button" onClick={() => void submit()} disabled={isPending}>
						{isPending ? "Salvando..." : "Salvar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

function OccurrenceEditDialog({
	open,
	occurrence,
	payable,
	onOpenChange,
	onSaved,
}: {
	open: boolean;
	occurrence: PayableOccurrence | null;
	payable: PayableWithOccurrences | null;
	onOpenChange: (open: boolean) => void;
	onSaved: () => void;
}) {
	const [form, setForm] = useState<ReturnType<typeof buildOccurrenceEditFormState>>(
		() => buildOccurrenceEditFormState(occurrence),
	);
	const [isPending, startTransition] = useTransition();
	const [errorMessage, setErrorMessage] = useState<string | null>(null);
	const visible = open && !!occurrence && !!payable;
	const amountLocked = occurrence?.status === "paid";

	useEffect(() => {
		if (visible && occurrence) {
			setForm(buildOccurrenceEditFormState(occurrence));
			setErrorMessage(null);
		}
	}, [visible, occurrence]);

	const submit = async () => {
		if (!form.dueDate) {
			setErrorMessage("Informe o vencimento.");
			return;
		}

		const amount = parseMoneyInput(form.actualAmount);
		if (!Number.isFinite(amount ?? Number.NaN) || (amount ?? 0) <= 0) {
			setErrorMessage("Informe um valor válido.");
			return;
		}

		startTransition(async () => {
			const result = await updatePayableOccurrenceAction({
				occurrenceId: occurrence?.id ?? "",
				dueDate: form.dueDate,
				actualAmount: amount,
			});

			if (!result.success) {
				setErrorMessage(result.error);
				toast.error(result.error);
				return;
			}

			toast.success(result.message);
			onSaved();
			onOpenChange(false);
		});
	};

	const detailFields = payable && occurrence
		? buildPayableOccurrenceDetailFields({ payable: payable.payable, occurrence } as MonthlyPayableOccurrence)
		: [];

	return (
		<Dialog open={visible} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl">
				<DialogHeader>
					<DialogTitle>Editar competência</DialogTitle>
					<DialogDescription>
						{payable ? payable.payable.description : "Conta a pagar"} · {occurrence?.period}
					</DialogDescription>
				</DialogHeader>

				<div className="grid gap-4">
					<div className="grid gap-3 sm:grid-cols-2">
						{detailFields.map((field) => (
							<div key={field.label} className="rounded-lg border p-3 text-sm">
								<div className="text-xs uppercase text-muted-foreground">{field.label}</div>
								<div className="font-medium">{field.value}</div>
							</div>
						))}
					</div>

					<div className="grid gap-4 sm:grid-cols-2">
						<div className="space-y-2">
							<Label htmlFor="payable-edit-due-date">Vencimento</Label>
							<Input
								id="payable-edit-due-date"
								type="date"
								value={form.dueDate}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										dueDate: event.target.value,
									}))
								}
							/>
						</div>
						<div className="space-y-2">
							<Label htmlFor="payable-edit-amount">Valor real</Label>
							<Input
								id="payable-edit-amount"
								value={form.actualAmount}
								onChange={(event) =>
									setForm((current) => ({
										...current,
										actualAmount: event.target.value,
									}))
								}
								disabled={amountLocked}
								placeholder="0,00"
							/>
							{amountLocked ? (
								<p className="text-xs text-muted-foreground">
									Valor financeiro travado porque a ocorrência já está paga.
								</p>
							) : null}
						</div>
					</div>
				</div>

				{errorMessage ? <p className="text-sm text-destructive">{errorMessage}</p> : null}

				<DialogFooter>
					<Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
						Cancelar
					</Button>
					<Button type="button" onClick={() => void submit()} disabled={isPending}>
						{isPending ? "Salvando..." : "Salvar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}

export function PayablesPage({
	data,
	initialPayableId,
	mode = "operational",
}: {
	data: PayablesPageData;
	initialPayableId?: string | null;
	mode?: "operational" | "history";
}) {
	const router = useRouter();
	const [formOpen, setFormOpen] = useState(false);
	const [formMode, setFormMode] = useState<"create" | "update">("create");
	const [selectedPayable, setSelectedPayable] =
		useState<PayableWithOccurrences | null>(null);

	useEffect(() => {
		if (!initialPayableId) {
			return;
		}
		const initialSelection = data.payables.find(
			(item) => item.payable.id === initialPayableId,
		);
		if (initialSelection) {
			setSelectedPayable(initialSelection);
		}
	}, [data.payables, initialPayableId]);

	const defaultPeriod = data.today.slice(0, 7);
	const [period, setPeriod] = useMonthlyPeriod(defaultPeriod);
	const operationalOccurrences = useMemo(
		() => buildOperationalMonthlyPayableOccurrences(data.payables, period),
		[data.payables, period],
	);
	const historyOccurrences = useMemo(
		() => buildHistoricalPayableOccurrences(data.payables),
		[data.payables],
	);
	const historyPayable = useMemo(
		() =>
			mode === "history" && initialPayableId
				? (data.payables.find((item) => item.payable.id === initialPayableId) ??
					null)
				: null,
		[data.payables, initialPayableId, mode],
	);
	const monthlySummary = useMemo(
		() =>
			computeMonthlySummary(
				operationalOccurrences.map((item) => item.occurrence),
			),
		[operationalOccurrences],
	);
	const historySummary = useMemo(
		() =>
			computeMonthlySummary(historyOccurrences.map((item) => item.occurrence)),
		[historyOccurrences],
	);
	const sortedOperationalOccurrences = useMemo(
		() => sortMonthlyPayableOccurrences(operationalOccurrences),
		[operationalOccurrences],
	);
	const [detailOpen, setDetailOpen] = useState(false);
	const [editTarget, setEditTarget] = useState<{
		payable: PayableWithOccurrences | null;
		occurrence: PayableOccurrence;
	} | null>(null);
	const [deleteTarget, setDeleteTarget] =
		useState<PayableWithOccurrences | null>(null);
	const [cancelTarget, setCancelTarget] =
		useState<PayableWithOccurrences | null>(null);
	const [informTarget, setInformTarget] = useState<{
		payable: PayableWithOccurrences | null;
		occurrence: PayableOccurrence;
	} | null>(null);
	const [payTarget, setPayTarget] = useState<{
		payable: PayableWithOccurrences | null;
		occurrence: PayableOccurrence;
	} | null>(null);

	const orderedPayables = useMemo(
		() =>
			data.payables.slice().sort((left, right) => {
				const leftScore = summaryOrder(left);
				const rightScore = summaryOrder(right);
				for (let index = 0; index < leftScore.length; index += 1) {
					if (leftScore[index] !== rightScore[index]) {
						return leftScore[index] < rightScore[index] ? -1 : 1;
					}
				}
				return 0;
			}),
		[data.payables],
	);

	const openCreate = () => {
		setFormMode("create");
		setSelectedPayable(null);
		setFormOpen(true);
	};

	const openEdit = (payable: PayableWithOccurrences) => {
		setFormMode("update");
		setSelectedPayable(payable);
		setFormOpen(true);
	};

	const findPayableById = (payableId: string) =>
		data.payables.find((item) => item.payable.id === payableId) ?? null;

	const openDetail = (payable: PayableWithOccurrences) => {
		setSelectedPayable(payable);
		setDetailOpen(true);
	};

	const openHistory = (payable: PayableWithOccurrences) => {
		router.push(buildPayableHistoryHref(payable.payable.id));
	};

	const openMonthlyDetail = (item: MonthlyPayableOccurrence) => {
		router.push(buildPayableHistoryHref(item.payable.id));
	};

	const openMonthlyInform = (item: MonthlyPayableOccurrence) => {
		const payable = findPayableById(item.payable.id) ?? ({
			payable: item.payable,
			occurrences: [],
		} as unknown as PayableWithOccurrences);
		setSelectedPayable(payable);
		setDetailOpen(false);
		setInformTarget({
			payable,
			occurrence: item.occurrence as PayableOccurrence,
		});
	};

	const openMonthlyEdit = (item: MonthlyPayableOccurrence) => {
		const payable = findPayableById(item.payable.id) ?? ({
			payable: item.payable,
			occurrences: [],
		} as unknown as PayableWithOccurrences);
		setSelectedPayable(payable);
		setDetailOpen(false);
		setEditTarget({
			payable,
			occurrence: item.occurrence as PayableOccurrence,
		});
	};

	const openMonthlyPay = (item: MonthlyPayableOccurrence) => {
		const payable = findPayableById(item.payable.id) ?? ({
			payable: item.payable,
			occurrences: [],
		} as unknown as PayableWithOccurrences);
		setSelectedPayable(payable);
		setDetailOpen(false);
		setPayTarget({
			payable,
			occurrence: item.occurrence as PayableOccurrence,
		});
	};

	const refresh = () => router.refresh();

	const handleDelete = async (payable: PayableWithOccurrences) => {
		const result = await deletePayableAction({ id: payable.payable.id });
		if (!result.success) {
			toast.error(result.error);
			throw new Error(result.error);
		}
		toast.success(result.message);
		setDeleteTarget(null);
		refresh();
	};

	const handleCancel = async (payable: PayableWithOccurrences) => {
		const result = await cancelPayableAction({ id: payable.payable.id });
		if (!result.success) {
			toast.error(result.error);
			throw new Error(result.error);
		}
		toast.success(result.message);
		setCancelTarget(null);
		refresh();
	};

	const nextDueText = data.summary.nextDueDate
		? formatFinancialDateLabel(data.summary.nextDueDate, "Próximo", DATE_FORMAT)
		: "Sem próximas obrigações";

	if (mode === "history" && historyPayable) {
		const historyOccurrenceItems = sortMonthlyPayableOccurrencesChronologically(
			buildHistoricalPayableOccurrences([historyPayable]),
		);
		const historySummaryOnly = computeMonthlySummary(
			historyOccurrenceItems.map((item) => item.occurrence),
		);
		return (
			<div className="space-y-8">
				<div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
					<Button
						variant="outline"
						type="button"
						onClick={() => router.push("/payables")}
					>
						<RiArrowLeftSLine className="size-4" />
						Voltar
					</Button>
					<span>Histórico — {historyPayable.payable.description}</span>
				</div>
				<PayablesCompactPage
					view="history"
					period={period}
					headerTitle={`Histórico — ${historyPayable.payable.description}`}
					headerDescription={`Fornecedor ${historyPayable.payable.supplierName} · ${historyPayable.payable.categoryName ?? "Sem categoria"}`}
					summary={historySummaryOnly}
					occurrences={sortMonthlyPayableOccurrences(historyOccurrenceItems)}
					payables={data.payables}
					onOpenOccurrenceDetails={openMonthlyDetail}
					onInformAmount={openMonthlyInform}
					onEditOccurrence={openMonthlyEdit}
					onPay={openMonthlyPay}
					onOpenPayableDetails={openDetail}
					onOpenPayableHistory={openHistory}
					onEditPayable={openEdit}
					onCancelPayable={(item) => setCancelTarget(item)}
					onDeletePayable={(item) => setDeleteTarget(item)}
				/>
				<PayableFormDialog
					open={formOpen}
					mode={formMode}
					payable={selectedPayable}
					categories={data.categories}
					onOpenChange={setFormOpen}
					onSaved={refresh}
				/>
				<PayableDetailDialog
					open={detailOpen}
					payable={selectedPayable}
					onOpenChange={setDetailOpen}
					onEdit={(item) => {
						setDetailOpen(false);
						openEdit(item);
					}}
					onCancel={(item) => setCancelTarget(item)}
					onDelete={(item) => setDeleteTarget(item)}
					onInformAmount={(occurrence) => {
						setDetailOpen(false);
						setInformTarget({ payable: selectedPayable ?? null, occurrence });
					}}
					onPay={(occurrence) => {
						setDetailOpen(false);
						setPayTarget({ payable: selectedPayable ?? null, occurrence });
					}}
				/>
				<InformAmountDialog
					open={Boolean(informTarget)}
					occurrence={informTarget?.occurrence ?? null}
					payable={informTarget?.payable ?? null}
					onOpenChange={(open) => !open && setInformTarget(null)}
					onSaved={refresh}
				/>
				<OccurrenceEditDialog
					open={Boolean(editTarget)}
					occurrence={editTarget?.occurrence ?? null}
					payable={editTarget?.payable ?? null}
					onOpenChange={(open) => !open && setEditTarget(null)}
					onSaved={refresh}
				/>
				<PayablePaymentDialog
					open={Boolean(payTarget)}
					occurrence={payTarget?.occurrence ?? null}
					payable={payTarget?.payable ?? null}
					data={data}
					onOpenChange={(open) => !open && setPayTarget(null)}
					onSaved={refresh}
				/>
				<ConfirmActionDialog
					open={Boolean(deleteTarget)}
					onOpenChange={(open) => !open && setDeleteTarget(null)}
					title={
						deleteTarget
							? `Remover ${deleteTarget.payable.description}?`
							: "Remover conta a pagar?"
					}
					description="Essa ação remove o template e todas as ocorrências associadas."
					confirmLabel="Remover"
					pendingLabel="Removendo..."
					confirmVariant="destructive"
					onConfirm={async () => {
						if (deleteTarget) {
							await handleDelete(deleteTarget);
						}
					}}
				/>
				<ConfirmActionDialog
					open={Boolean(cancelTarget)}
					onOpenChange={(open) => !open && setCancelTarget(null)}
					title={
						cancelTarget
							? `${cancelTarget.payable.status === "cancelled" ? "Ativar" : "Inativar"} ${cancelTarget.payable.description}?`
							: "Inativar conta a pagar?"
					}
					description={
						cancelTarget?.payable.status === "cancelled"
							? "A conta a pagar será reativada e o horizonte será recomposto sem duplicar ocorrências já existentes."
							: "A conta a pagar será inativada sem apagar histórico, pagamentos ou ocorrências já materializadas."
					}
					confirmLabel={cancelTarget?.payable.status === "cancelled" ? "Ativar" : "Inativar"}
					pendingLabel={cancelTarget?.payable.status === "cancelled" ? "Ativando..." : "Inativando..."}
					confirmVariant={cancelTarget?.payable.status === "cancelled" ? "default" : "destructive"}
					onConfirm={async () => {
						if (cancelTarget) {
							await handleCancel(cancelTarget);
						}
					}}
				/>
				</div>
			);
		}

	return (
		<div className="space-y-8">
			<div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
				<div className="space-y-2">
					<div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
						<RiCalendarEventLine className="size-4 text-primary" />
						<span>Finanças</span>
					</div>
					<h1 className="text-3xl font-bold tracking-tight">Contas a pagar</h1>
					<p className="max-w-3xl text-sm text-muted-foreground sm:text-base">
						Obrigações pontuais e recorrentes, com calendário read-only e sem
						criar transactions antecipadamente.
					</p>
				</div>

				<Button onClick={openCreate} className="self-start lg:self-auto">
					<RiAddLine className="size-4" />
					Nova conta a pagar
				</Button>
			</div>

			<PayablesCompactPage
				view="operational"
				period={period}
				onPeriodChange={setPeriod}
				summary={monthlySummary}
				occurrences={sortedOperationalOccurrences}
				payables={data.payables}
				onOpenOccurrenceDetails={openMonthlyDetail}
				onInformAmount={openMonthlyInform}
				onEditOccurrence={openMonthlyEdit}
				onPay={openMonthlyPay}
				onOpenPayableDetails={openDetail}
				onEditPayable={openEdit}
				onCancelPayable={(item) => setCancelTarget(item)}
				onDeletePayable={(item) => setDeleteTarget(item)}
				onOpenPayableHistory={openHistory}
			/>

			<PayableFormDialog
				open={formOpen}
				mode={formMode}
				payable={selectedPayable}
				categories={data.categories}
				onOpenChange={setFormOpen}
				onSaved={refresh}
			/>
			<PayableDetailDialog
				open={detailOpen}
				payable={selectedPayable}
				onOpenChange={setDetailOpen}
				onEdit={(item) => {
					setDetailOpen(false);
					openEdit(item);
				}}
				onCancel={(item) => setCancelTarget(item)}
				onDelete={(item) => setDeleteTarget(item)}
				onInformAmount={(occurrence) => {
					setDetailOpen(false);
					setInformTarget({ payable: selectedPayable ?? null, occurrence });
				}}
				onPay={(occurrence) => {
					setDetailOpen(false);
					setPayTarget({ payable: selectedPayable ?? null, occurrence });
				}}
			/>
			<InformAmountDialog
				open={Boolean(informTarget)}
				occurrence={informTarget?.occurrence ?? null}
				payable={informTarget?.payable ?? null}
				onOpenChange={(open) => !open && setInformTarget(null)}
				onSaved={refresh}
			/>
			<OccurrenceEditDialog
				open={Boolean(editTarget)}
				occurrence={editTarget?.occurrence ?? null}
				payable={editTarget?.payable ?? null}
				onOpenChange={(open) => !open && setEditTarget(null)}
				onSaved={refresh}
			/>
			<PayablePaymentDialog
				open={Boolean(payTarget)}
				occurrence={payTarget?.occurrence ?? null}
				payable={payTarget?.payable ?? null}
				data={data}
				onOpenChange={(open) => !open && setPayTarget(null)}
				onSaved={refresh}
			/>
			<ConfirmActionDialog
				open={Boolean(deleteTarget)}
				onOpenChange={(open) => !open && setDeleteTarget(null)}
				title={
					deleteTarget
						? `Remover ${deleteTarget.payable.description}?`
						: "Remover conta a pagar?"
				}
				description="Essa ação remove o template e todas as ocorrências associadas."
				confirmLabel="Remover"
				pendingLabel="Removendo..."
				confirmVariant="destructive"
				onConfirm={async () => {
					if (deleteTarget) {
						await handleDelete(deleteTarget);
					}
				}}
			/>
			<ConfirmActionDialog
				open={Boolean(cancelTarget)}
				onOpenChange={(open) => !open && setCancelTarget(null)}
				title={
					cancelTarget
						? `${cancelTarget.payable.status === "cancelled" ? "Ativar" : "Inativar"} ${cancelTarget.payable.description}?`
						: "Inativar conta a pagar?"
				}
				description={
					cancelTarget?.payable.status === "cancelled"
						? "A conta a pagar será reativada e o horizonte será recomposto sem duplicar ocorrências já existentes."
						: "A conta a pagar será inativada sem apagar histórico, pagamentos ou ocorrências já materializadas."
				}
				confirmLabel={cancelTarget?.payable.status === "cancelled" ? "Ativar" : "Inativar"}
				pendingLabel={cancelTarget?.payable.status === "cancelled" ? "Ativando..." : "Inativando..."}
				confirmVariant={cancelTarget?.payable.status === "cancelled" ? "default" : "destructive"}
				onConfirm={async () => {
					if (cancelTarget) {
						await handleCancel(cancelTarget);
					}
				}}
			/>
		</div>
	);
}
