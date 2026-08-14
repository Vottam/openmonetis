import { notFound } from "next/navigation";
import { connection } from "next/server";
import { PayablesPage } from "@/features/payables/page";
import { fetchPayablesPageData } from "@/features/payables/queries";
import { getUserId } from "@/shared/lib/auth/server";

export default async function PayableHistoryPage({
	params,
}: {
	params: Promise<{ payableId: string }>;
}) {
	await connection();
	const { payableId } = await params;
	const userId = await getUserId();
	const data = await fetchPayablesPageData(userId);
	const payable = data.payables.find((item) => item.payable.id === payableId);

	if (!payable) {
		notFound();
	}

	return (
		<PayablesPage data={data} initialPayableId={payableId} mode="history" />
	);
}
