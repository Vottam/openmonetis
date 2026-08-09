"use client";

import { Input } from "@/shared/components/ui/input";
import { Label } from "@/shared/components/ui/label";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/shared/components/ui/select";
import { Textarea } from "@/shared/components/ui/textarea";

import type { LoanInstitutionFormValues } from "./types";

interface InstitutionFormFieldsProps {
	values: LoanInstitutionFormValues;
	onChange: <K extends keyof LoanInstitutionFormValues>(
		field: K,
		value: LoanInstitutionFormValues[K],
	) => void;
}

export function InstitutionFormFields({
	values,
	onChange,
}: InstitutionFormFieldsProps) {
	const INSTITUTION_TYPES = [
		{ value: "bank", label: "Banco" },
		{ value: "other", label: "Outros" },
	] as const;

	return (
		<div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
			<div className="flex flex-col gap-2">
				<Label htmlFor="institution-name">Nome da instituição</Label>
				<Input
					id="institution-name"
					value={values.name}
					onChange={(event) => onChange("name", event.target.value)}
					placeholder="Ex.: Nubank"
					required
				/>
			</div>

			<div className="flex flex-col gap-2">
				<Label htmlFor="institution-type">Tipo</Label>
				<Select
					value={values.type}
					onValueChange={(value) => onChange("type", value)}
				>
					<SelectTrigger id="institution-type" className="w-full">
						<SelectValue placeholder="Selecione o tipo">
							{INSTITUTION_TYPES.find((type) => type.value === values.type)
								?.label ?? values.type}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{INSTITUTION_TYPES.map((type) => (
							<SelectItem key={type.value} value={type.value}>
								{type.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			<div className="flex flex-col gap-2 sm:col-span-2">
				<Label htmlFor="institution-description">Descrição</Label>
				<Textarea
					id="institution-description"
					value={values.description}
					onChange={(event) => onChange("description", event.target.value)}
					placeholder="Informações adicionais sobre a instituição"
					rows={3}
				/>
			</div>
		</div>
	);
}
