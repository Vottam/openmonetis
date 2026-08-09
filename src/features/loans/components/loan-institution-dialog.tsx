"use client";

import { type ReactNode, useEffect, useMemo, useTransition } from "react";
import { toast } from "sonner";
import { createLoanInstitutionAction } from "@/features/loans/actions";
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
import { useControlledState } from "@/shared/hooks/use-controlled-state";
import { useFormState } from "@/shared/hooks/use-form-state";

import { InstitutionFormFields } from "./institution-form-fields";
import type { LoanInstitutionFormValues } from "./types";

interface LoanInstitutionDialogProps {
	trigger?: ReactNode;
	open?: boolean;
	onOpenChange?: (open: boolean) => void;
	onSuccess?: () => void;
}

const INITIAL_STATE: LoanInstitutionFormValues = {
	name: "",
	type: "bank",
	description: "",
};

export function LoanInstitutionDialog({
	trigger,
	open,
	onOpenChange,
	onSuccess,
}: LoanInstitutionDialogProps) {
	const [isPending, startTransition] = useTransition();
	const [dialogOpen, setDialogOpen] = useControlledState(
		open,
		false,
		onOpenChange,
	);

	const initialState = useMemo(() => INITIAL_STATE, []);
	const { formState, resetForm, updateField } =
		useFormState<LoanInstitutionFormValues>(initialState);

	useEffect(() => {
		if (dialogOpen) {
			resetForm(initialState);
		}
	}, [dialogOpen, initialState, resetForm]);

	const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
		event.preventDefault();

		const payload = {
			name: formState.name.trim(),
			type: formState.type,
			description: formState.description.trim(),
		};

		if (!payload.name) {
			toast.error("Informe o nome da instituição.");
			return;
		}

		startTransition(async () => {
			try {
				const result = await createLoanInstitutionAction(payload);

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
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Nova conta / linha</DialogTitle>
					<DialogDescription>
						Cadastre a instituição que vai agrupar suas operações de empréstimo.
					</DialogDescription>
				</DialogHeader>

				<form className="space-y-5" onSubmit={handleSubmit}>
					<InstitutionFormFields values={formState} onChange={updateField} />

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => setDialogOpen(false)}
							disabled={isPending}
						>
							Cancelar
						</Button>
						<Button type="submit" disabled={isPending}>
							{isPending ? "Salvando..." : "Salvar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
