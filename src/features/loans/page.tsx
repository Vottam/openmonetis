import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@/shared/components/ui/card";

export default function LoansPage() {
	return (
		<div className="p-4">
			<Card>
				<CardHeader>
					<CardTitle>Empréstimos</CardTitle>
				</CardHeader>
				<CardContent>
					A área de empréstimos está pronta para a próxima rodada de validação.
				</CardContent>
			</Card>
		</div>
	);
}
