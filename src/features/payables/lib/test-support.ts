import { randomUUID } from "node:crypto";

import { categories, user } from "@/db/schema";
import { db } from "@/shared/lib/db";

export function createPayablesTestSeed() {
	const _suffix = randomUUID();
	const categoryId = randomUUID();
	const otherCategoryId = randomUUID();
	const userId = randomUUID();
	const otherUserId = randomUUID();

	return {
		user: {
			id: userId,
			name: "Payables Test User",
			email: `payables-test-${userId}@example.com`,
			emailVerified: true,
			image: null,
			createdAt: new Date("2025-01-01T00:00:00.000Z"),
			updatedAt: new Date("2025-01-01T00:00:00.000Z"),
		},
		otherUser: {
			id: otherUserId,
			name: "Other Payables User",
			email: `payables-other-${otherUserId}@example.com`,
			emailVerified: true,
			image: null,
			createdAt: new Date("2025-01-01T00:00:00.000Z"),
			updatedAt: new Date("2025-01-01T00:00:00.000Z"),
		},
		category: {
			id: categoryId,
			name: "Moradia",
			type: "despesa",
			icon: "RiHomeLine",
			userId,
		},
		otherCategory: {
			id: otherCategoryId,
			name: "Transporte",
			type: "despesa",
			icon: "RiBusLine",
			userId: otherUserId,
		},
	};
}

export async function seedPayablesTestData() {
	const seed = createPayablesTestSeed();

	await db.insert(user).values([seed.user, seed.otherUser]);
	await db.insert(categories).values([seed.category, seed.otherCategory]);

	return {
		userId: seed.user.id,
		otherUserId: seed.otherUser.id,
		categoryId: seed.category.id,
		categoryName: seed.category.name,
		otherCategoryId: seed.otherCategory.id,
		otherCategoryName: seed.otherCategory.name,
	};
}
