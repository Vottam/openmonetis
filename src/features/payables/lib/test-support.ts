import { randomUUID } from "node:crypto";

import { cards, categories, financialAccounts, user } from "@/db/schema";
import { db } from "@/shared/lib/db";

export function createPayablesTestSeed() {
	const categoryId = randomUUID();
	const otherCategoryId = randomUUID();
	const userId = randomUUID();
	const otherUserId = randomUUID();
	const accountId = randomUUID();
	const cardId = randomUUID();

	return {
		user: {
			id: `payables-test-user-${userId}`,
			name: "Payables Test User",
			email: `payables-test-${userId}@example.com`,
			emailVerified: true,
			image: null,
			createdAt: new Date("2025-01-01T00:00:00.000Z"),
			updatedAt: new Date("2025-01-01T00:00:00.000Z"),
		},
		otherUser: {
			id: `payables-other-user-${otherUserId}`,
			name: "Other Payables User",
			email: `payables-other-${otherUserId}@example.com`,
			emailVerified: true,
			image: null,
			createdAt: new Date("2025-01-01T00:00:00.000Z"),
			updatedAt: new Date("2025-01-01T00:00:00.000Z"),
		},
		account: {
			id: accountId,
			name: "Conta Teste",
			accountType: "bank",
			note: null,
			status: "active",
			logo: "",
			initialBalance: "0",
			excludeFromBalance: false,
			excludeInitialBalanceFromIncome: false,
			userId: `payables-test-user-${userId}`,
		},
		card: {
			id: cardId,
			name: "Cartão Teste",
			closingDay: "10",
			dueDay: "20",
			note: null,
			limit: "1000",
			brand: null,
			logo: null,
			status: "active",
			userId: `payables-test-user-${userId}`,
			accountId,
		},
		category: {
			id: categoryId,
			name: "Moradia",
			type: "despesa",
			icon: "RiHomeLine",
			userId: `payables-test-user-${userId}`,
		},
		otherCategory: {
			id: otherCategoryId,
			name: "Transporte",
			type: "despesa",
			icon: "RiBusLine",
			userId: `payables-other-user-${otherUserId}`,
		},
	};
}

export async function seedPayablesTestData() {
	const seed = createPayablesTestSeed();
	const payablesTestContext = globalThis as typeof globalThis & {
		__loanTestUser?: typeof seed.user;
		__payablesTestUser?: typeof seed.user;
	};
	payablesTestContext.__loanTestUser = seed.user;
	payablesTestContext.__payablesTestUser = seed.user;

	await db.insert(user).values([seed.user, seed.otherUser]);
	await db.insert(financialAccounts).values(seed.account);
	await db.insert(cards).values(seed.card);
	await db.insert(categories).values([seed.category, seed.otherCategory]);

	return {
		userId: seed.user.id,
		otherUserId: seed.otherUser.id,
		categoryId: seed.category.id,
		categoryName: seed.category.name,
		otherCategoryId: seed.otherCategory.id,
		otherCategoryName: seed.otherCategory.name,
		accountId: seed.account.id,
		cardId: seed.card.id,
	};
}
