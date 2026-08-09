"use client";

import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";

export function LoanDetailPanel({
	accountId,
	institutionId,
}: {
	accountId: string;
	institutionId: string;
}) {
	return (
		<Card>
			<CardHeader>
				<CardTitle>Detalhes do empréstimo</CardTitle>
			</CardHeader>
			<CardContent className="text-sm text-muted-foreground">
				Conta: {accountId} · Instituição: {institutionId}
			</CardContent>
		</Card>
	);
}
