import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { payers, user } from "@/db/schema";
import { db } from "@/shared/lib/db";
import {
	PAYER_ROLE_ADMIN,
	PAYER_ROLE_THIRD_PARTY,
} from "@/shared/lib/payers/constants";
import { ensureDefaultPayerForUser } from "./defaults";

function makeUserFixture() {
	const suffix = randomUUID();
	return {
		id: `payer-default-test-user-${suffix}`,
		name: "Payer Default Test User",
		email: `payer-default-test-${suffix}@example.com`,
		emailVerified: true,
		image: null,
		createdAt: new Date("2025-01-01T00:00:00.000Z"),
		updatedAt: new Date("2025-01-01T00:00:00.000Z"),
	};
}

describe("ensureDefaultPayerForUser", () => {
	it("cria pagador admin quando existe apenas pagador de terceiro", async () => {
		const fixture = makeUserFixture();
		const thirdPartyPayerId = randomUUID();

		await db.insert(user).values(fixture);
		await db.insert(payers).values({
			id: thirdPartyPayerId,
			name: "Pessoa Terceira",
			email: null,
			avatarUrl: null,
			status: "Ativo",
			note: null,
			role: PAYER_ROLE_THIRD_PARTY,
			isAutoSend: false,
			shareCode: `payer-share-${randomUUID()}`,
			lastMailAt: null,
			userId: fixture.id,
		});

		await ensureDefaultPayerForUser({
			id: fixture.id,
			name: fixture.name,
			email: fixture.email,
			image: fixture.image,
		});

		const rowsAfterFirstEnsure = await db
			.select({ id: payers.id, role: payers.role, name: payers.name })
			.from(payers)
			.where(eq(payers.userId, fixture.id));

		expect(rowsAfterFirstEnsure).toHaveLength(2);
		expect(rowsAfterFirstEnsure.filter((row) => row.role === PAYER_ROLE_ADMIN)).toHaveLength(1);
		expect(rowsAfterFirstEnsure.filter((row) => row.role === PAYER_ROLE_THIRD_PARTY)).toHaveLength(1);

		await ensureDefaultPayerForUser({
			id: fixture.id,
			name: fixture.name,
			email: fixture.email,
			image: fixture.image,
		});

		const rowsAfterSecondEnsure = await db
			.select({ id: payers.id, role: payers.role, name: payers.name })
			.from(payers)
			.where(eq(payers.userId, fixture.id));

		expect(rowsAfterSecondEnsure).toHaveLength(2);
		expect(rowsAfterSecondEnsure.filter((row) => row.role === PAYER_ROLE_ADMIN)).toHaveLength(1);

		await db.delete(payers).where(eq(payers.userId, fixture.id));
		await db.delete(user).where(eq(user.id, fixture.id));
	});
});
