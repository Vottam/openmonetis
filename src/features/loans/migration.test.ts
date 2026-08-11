import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
	throw new Error("DATABASE_URL não definida para os testes de migration.");
}

const DATABASE_URL_OBJECT = new URL(DATABASE_URL);
const DRIZZLE_DIR = resolve(process.cwd(), "drizzle");
const JOURNAL_PATH = resolve(DRIZZLE_DIR, "meta/_journal.json");
const SNAPSHOT_PATH = resolve(DRIZZLE_DIR, "meta/0035_snapshot.json");
const MIGRATION_0035_PATH = resolve(DRIZZLE_DIR, "0035_ambiguous_vulcan.sql");

const JOURNAL = JSON.parse(readFileSync(JOURNAL_PATH, "utf8")) as {
	entries: Array<{ tag: string }>;
};

const SNAPSHOT = JSON.parse(readFileSync(SNAPSHOT_PATH, "utf8")) as {
	tables: Record<
		string,
		{
			foreignKeys?: Record<string, { onDelete?: string }>;
			indexes?: Record<string, unknown>;
			columns?: Record<
				string,
				{ notNull?: boolean; type?: string; default?: unknown }
			>;
		}
	>;
};

const JOURNAL_MIGRATIONS = JOURNAL.entries
	.filter((entry) => entry.tag !== "0035_ambiguous_vulcan")
	.map((entry) => ({
		tag: entry.tag,
		path: resolve(DRIZZLE_DIR, `${entry.tag}.sql`),
	}));

const CLEAN_INSTALL_MIGRATIONS = [
	...JOURNAL_MIGRATIONS,
	{ tag: "0035_ambiguous_vulcan", path: MIGRATION_0035_PATH },
];

const LOAN_TABLES = [
	"institutions",
	"loan_installments",
	"loan_operations",
	"loan_payments",
	"loan_types",
] as const;

const EXPECTED_FOREIGN_KEYS = [
	{
		table: "institutions",
		name: "institutions_user_id_user_id_fk",
		column: "user_id",
		foreignTable: "user",
		doDelete: "CASCADE",
	},
	{
		table: "loan_installments",
		name: "loan_installments_loan_operation_id_loan_operations_id_fk",
		column: "loan_operation_id",
		foreignTable: "loan_operations",
		doDelete: "CASCADE",
	},
	{
		table: "loan_installments",
		name: "loan_installments_user_id_user_id_fk",
		column: "user_id",
		foreignTable: "user",
		doDelete: "CASCADE",
	},
	{
		table: "loan_installments",
		name: "loan_installments_payer_id_pagadores_id_fk",
		column: "payer_id",
		foreignTable: "pagadores",
		doDelete: "SET NULL",
	},
	{
		table: "loan_operations",
		name: "loan_operations_institution_id_institutions_id_fk",
		column: "institution_id",
		foreignTable: "institutions",
		doDelete: "CASCADE",
	},
	{
		table: "loan_operations",
		name: "loan_operations_user_id_user_id_fk",
		column: "user_id",
		foreignTable: "user",
		doDelete: "CASCADE",
	},
	{
		table: "loan_operations",
		name: "loan_operations_payer_id_pagadores_id_fk",
		column: "payer_id",
		foreignTable: "pagadores",
		doDelete: "SET NULL",
	},
	{
		table: "loan_payments",
		name: "loan_payments_loan_operation_id_loan_operations_id_fk",
		column: "loan_operation_id",
		foreignTable: "loan_operations",
		doDelete: "CASCADE",
	},
	{
		table: "loan_payments",
		name: "loan_payments_installment_id_loan_installments_id_fk",
		column: "installment_id",
		foreignTable: "loan_installments",
		doDelete: "CASCADE",
	},
	{
		table: "loan_payments",
		name: "loan_payments_user_id_user_id_fk",
		column: "user_id",
		foreignTable: "user",
		doDelete: "CASCADE",
	},
	{
		table: "loan_payments",
		name: "loan_payments_payer_id_pagadores_id_fk",
		column: "payer_id",
		foreignTable: "pagadores",
		doDelete: "SET NULL",
	},
] as const;

function quoteIdentifier(identifier: string) {
	return `"${identifier.replaceAll('"', '""')}"`;
}

function toDatabaseUrl(databaseName: string) {
	const url = new URL(DATABASE_URL_OBJECT);
	url.pathname = `/${databaseName}`;
	return url.toString();
}

async function withTemporaryDatabase<T>(
	prefix: string,
	fn: (client: Client, databaseName: string) => Promise<T>,
) {
	const admin = new Client({ connectionString: DATABASE_URL });
	await admin.connect();

	const databaseName = `${prefix}_${Date.now()}_${randomUUID().replaceAll("-", "")}`;

	await admin.query(
		`CREATE DATABASE ${quoteIdentifier(databaseName)} TEMPLATE template0`,
	);

	const client = new Client({ connectionString: toDatabaseUrl(databaseName) });
	await client.connect();
	await client.query(`CREATE EXTENSION IF NOT EXISTS "pgcrypto"`);

	try {
		return await fn(client, databaseName);
	} finally {
		await client.end().catch(() => undefined);
		await admin.query(
			`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)}`,
		);
		await admin.end().catch(() => undefined);
	}
}

async function shouldSkipStatement(
	client: Client,
	statement: string,
	error: unknown,
) {
	const message = error instanceof Error ? error.message : String(error);

	const renameMatch = statement.match(
		/^ALTER TABLE\s+"(?<from>[^"]+)"\s+RENAME TO\s+"(?<to>[^"]+)"\s*;?$/s,
	);
	if (renameMatch?.groups) {
		if (/relation .* does not exist/i.test(message)) {
			const existence = await client.query<{
				from_table: string | null;
				to_table: string | null;
			}>(`SELECT to_regclass($1) AS from_table, to_regclass($2) AS to_table`, [
				renameMatch.groups.from,
				renameMatch.groups.to,
			]);

			return !existence.rows[0]?.from_table && !!existence.rows[0]?.to_table;
		}
	}

	const dropIndexMatch = statement.match(
		/^DROP INDEX\s+"(?<index>[^"]+)"\s*;?$/s,
	);
	if (dropIndexMatch?.groups && /does not exist/i.test(message)) {
		const existence = await client.query<{ exists: boolean }>(
			`SELECT to_regclass($1) IS NOT NULL AS exists`,
			[dropIndexMatch.groups.index],
		);

		return !existence.rows[0]?.exists;
	}

	const dropConstraintMatch = statement.match(
		/^ALTER TABLE\s+"(?<table>[^"]+)"\s+DROP CONSTRAINT\s+"(?<constraint>[^"]+)"\s*;?$/s,
	);
	if (dropConstraintMatch?.groups && /does not exist/i.test(message)) {
		const existence = await client.query<{ exists: boolean }>(
			`SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = $1) AS exists`,
			[dropConstraintMatch.groups.constraint],
		);

		return !existence.rows[0]?.exists;
	}

	const createIndexMatch = statement.match(
		/^CREATE (?:UNIQUE )?INDEX\s+"(?<index>[^"]+)"\s+ON\s+"(?<table>[^"]+)"/s,
	);
	if (createIndexMatch?.groups && /already exists/i.test(message)) {
		const existence = await client.query<{ exists: boolean }>(
			`SELECT to_regclass($1) IS NOT NULL AS exists`,
			[createIndexMatch.groups.index],
		);

		return !!existence.rows[0]?.exists;
	}

	const createTableMatch = statement.match(
		/^CREATE TABLE\s+"(?<table>[^"]+)"/s,
	);
	if (createTableMatch?.groups && /already exists/i.test(message)) {
		const existence = await client.query<{ exists: boolean }>(
			`SELECT to_regclass($1) IS NOT NULL AS exists`,
			[createTableMatch.groups.table],
		);

		return !!existence.rows[0]?.exists;
	}

	const addConstraintMatch = statement.match(
		/^ALTER TABLE\s+"(?<table>[^"]+)"\s+ADD CONSTRAINT\s+"(?<constraint>[^"]+)"/s,
	);
	if (addConstraintMatch?.groups && /already exists/i.test(message)) {
		const existence = await client.query<{ exists: boolean }>(
			`SELECT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = $1) AS exists`,
			[addConstraintMatch.groups.constraint],
		);

		return !!existence.rows[0]?.exists;
	}

	return false;
}

async function applySqlFile(client: Client, filePath: string) {
	const migrationSql = await readFile(filePath, "utf8");
	const statements = migrationSql
		.split("--> statement-breakpoint")
		.map((statement) => statement.trim())
		.filter(Boolean);

	for (const statement of statements) {
		try {
			await client.query(statement);
		} catch (error) {
			if (await shouldSkipStatement(client, statement, error)) {
				continue;
			}

			throw error;
		}
	}
}

async function applyMigrations(
	client: Client,
	migrations: ReadonlyArray<{ path: string }>,
) {
	for (const migration of migrations) {
		await applySqlFile(client, migration.path);
	}
}

async function getExistingTables(client: Client) {
	const result = await client.query<{
		table_name: string;
	}>(
		`
			SELECT table_name
			FROM information_schema.tables
			WHERE table_schema = 'public'
			  AND table_name = ANY($1::text[])
			ORDER BY table_name
		`,
		[LOAN_TABLES],
	);

	return result.rows.map((row) => row.table_name);
}

async function getForeignKeys(client: Client) {
	const result = await client.query<{
		constraint_name: string;
		table_name: string;
		column_name: string;
		foreign_table_name: string;
		foreign_column_name: string;
		delete_rule: string;
	}>(
		`
			SELECT
				tc.constraint_name,
				kcu.table_name,
				kcu.column_name,
				ccu.table_name AS foreign_table_name,
				ccu.column_name AS foreign_column_name,
				rc.delete_rule
			FROM information_schema.table_constraints AS tc
			JOIN information_schema.key_column_usage AS kcu
				ON tc.constraint_name = kcu.constraint_name
				AND tc.constraint_schema = kcu.constraint_schema
			JOIN information_schema.referential_constraints AS rc
				ON tc.constraint_name = rc.constraint_name
				AND tc.constraint_schema = rc.constraint_schema
			JOIN information_schema.constraint_column_usage AS ccu
				ON ccu.constraint_name = tc.constraint_name
				AND ccu.constraint_schema = tc.constraint_schema
			WHERE tc.constraint_type = 'FOREIGN KEY'
			  AND tc.table_schema = 'public'
			  AND tc.table_name = ANY($1::text[])
			ORDER BY tc.constraint_name
		`,
		[LOAN_TABLES],
	);

	return result.rows;
}

async function getLoanIndexes(client: Client) {
	const result = await client.query<{
		table_name: string;
		indexname: string;
	}>(
		`
			SELECT tablename AS table_name, indexname
			FROM pg_indexes
			WHERE schemaname = 'public'
			  AND tablename = ANY($1::text[])
			ORDER BY tablename, indexname
		`,
		[LOAN_TABLES],
	);

	return result.rows;
}

function assertSnapshotMatchesMigration() {
	const loanTableEntries = LOAN_TABLES.map((table) => `public.${table}`);

	for (const tableName of loanTableEntries) {
		expect(
			SNAPSHOT.tables[tableName],
			`snapshot missing ${tableName}`,
		).toBeDefined();
	}

	expect(
		SNAPSHOT.tables["public.institutions"].foreignKeys
			?.institutions_user_id_user_id_fk?.onDelete,
	).toBe("cascade");
	expect(SNAPSHOT.tables["public.institutions"].columns?.logo?.type).toBe(
		"text",
	);
	expect(SNAPSHOT.tables["public.institutions"].columns?.logo?.notNull).toBe(
		false,
	);
	expect(
		SNAPSHOT.tables["public.institutions"].columns?.logo?.default,
	).toBeUndefined();
	expect(
		SNAPSHOT.tables["public.loan_installments"].foreignKeys
			?.loan_installments_loan_operation_id_loan_operations_id_fk?.onDelete,
	).toBe("cascade");
	expect(
		SNAPSHOT.tables["public.loan_installments"].foreignKeys
			?.loan_installments_user_id_user_id_fk?.onDelete,
	).toBe("cascade");
	expect(
		SNAPSHOT.tables["public.loan_installments"].foreignKeys
			?.loan_installments_payer_id_pagadores_id_fk?.onDelete,
	).toBe("set null");
	expect(
		SNAPSHOT.tables["public.loan_operations"].foreignKeys
			?.loan_operations_institution_id_institutions_id_fk?.onDelete,
	).toBe("cascade");
	expect(
		SNAPSHOT.tables["public.loan_operations"].foreignKeys
			?.loan_operations_user_id_user_id_fk?.onDelete,
	).toBe("cascade");
	expect(
		SNAPSHOT.tables["public.loan_operations"].foreignKeys
			?.loan_operations_payer_id_pagadores_id_fk?.onDelete,
	).toBe("set null");
	expect(
		SNAPSHOT.tables["public.loan_payments"].foreignKeys
			?.loan_payments_loan_operation_id_loan_operations_id_fk?.onDelete,
	).toBe("cascade");
	expect(
		SNAPSHOT.tables["public.loan_payments"].foreignKeys
			?.loan_payments_installment_id_loan_installments_id_fk?.onDelete,
	).toBe("cascade");
	expect(
		SNAPSHOT.tables["public.loan_payments"].foreignKeys
			?.loan_payments_user_id_user_id_fk?.onDelete,
	).toBe("cascade");
	expect(
		SNAPSHOT.tables["public.loan_payments"].foreignKeys
			?.loan_payments_payer_id_pagadores_id_fk?.onDelete,
	).toBe("set null");
	expect(SNAPSHOT.tables["public.pagadores"].columns?.id?.type).toBe("uuid");
	expect(
		SNAPSHOT.tables["public.loan_installments"].columns?.payer_id?.type,
	).toBe("uuid");
	expect(
		SNAPSHOT.tables["public.loan_operations"].columns?.payer_id?.type,
	).toBe("uuid");
	expect(SNAPSHOT.tables["public.loan_payments"].columns?.payer_id?.type).toBe(
		"uuid",
	);
}

async function seedPre0035Data(client: Client) {
	const userId = "TEST_PRE_0035_USER";
	const institutionId = "TEST_PRE_0035_INSTITUTION";
	const payerId = "11111111-1111-4111-8111-111111111111";

	await client.query(
		`
			INSERT INTO "user" (id, name, email, "emailVerified", image, "createdAt", "updatedAt")
			VALUES ($1, $2, $3, $4, $5, now(), now())
		`,
		[
			userId,
			"TEST_PRE_0035_USER",
			"test_pre_0035_user@example.com",
			true,
			null,
		],
	);

	await client.query(
		`
			INSERT INTO "pagadores" (
				id,
				nome,
				email,
				avatar_url,
				status,
				anotacao,
				role,
				is_auto_send,
				share_code,
				last_mail,
				created_at,
				user_id
			)
			VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now(), $11)
		`,
		[
			payerId,
			"TEST_PRE_0035_PAYER",
			null,
			null,
			"active",
			null,
			"admin",
			false,
			"TEST_PRE_0035_SHARE",
			null,
			userId,
		],
	);

	await client.query(
		`
			INSERT INTO "institutions" (
				id,
				name,
				type,
				description,
				user_id,
				created_at,
				updated_at
			)
			VALUES ($1, $2, $3, $4, $5, now(), now())
		`,
		[institutionId, "TEST_PRE_0035_INSTITUTION", "bank", null, userId],
	);

	return { userId, payerId, institutionId };
}

async function readExactRowCount(client: Client, tableName: string) {
	const result = await client.query<{ count: string }>(
		`SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(tableName)}`,
	);

	return result.rows[0]?.count ?? "0";
}

async function readColumnType(
	client: Client,
	tableName: string,
	columnName: string,
) {
	const result = await client.query<{ data_type: string }>(
		`
			SELECT data_type
			FROM information_schema.columns
			WHERE table_schema = 'public'
			  AND table_name = $1
			  AND column_name = $2
		`,
		[tableName, columnName],
	);

	return result.rows[0]?.data_type ?? null;
}

async function readColumnNullable(
	client: Client,
	tableName: string,
	columnName: string,
) {
	const result = await client.query<{
		is_nullable: string;
		column_default: string | null;
	}>(
		`
			SELECT is_nullable, column_default
			FROM information_schema.columns
			WHERE table_schema = 'public'
			  AND table_name = $1
			  AND column_name = $2
		`,
		[tableName, columnName],
	);

	return {
		isNullable: result.rows[0]?.is_nullable ?? null,
		columnDefault: result.rows[0]?.column_default ?? null,
	};
}

async function assertLoanSchema(client: Client) {
	const tables = await getExistingTables(client);
	expect(tables).toEqual([...LOAN_TABLES].sort());

	const foreignKeys = await getForeignKeys(client);
	expect(foreignKeys).toHaveLength(EXPECTED_FOREIGN_KEYS.length);

	for (const expected of EXPECTED_FOREIGN_KEYS) {
		const actual = foreignKeys.find(
			(foreignKey) => foreignKey.constraint_name === expected.name,
		);
		expect(actual, `missing foreign key ${expected.name}`).toBeDefined();
		expect(actual?.table_name).toBe(expected.table);
		expect(actual?.column_name).toBe(expected.column);
		expect(actual?.foreign_table_name).toBe(expected.foreignTable);
		expect(actual?.foreign_column_name).toBe("id");
		expect(actual?.delete_rule).toBe(expected.doDelete);
	}

	const indexes = await getLoanIndexes(client);
	const nonPrimaryIndexes = indexes.filter(
		(index) => !index.indexname.endsWith("_pkey"),
	);
	expect(nonPrimaryIndexes).toHaveLength(0);

	const payerIdType = await readColumnType(client, "pagadores", "id");
	expect(payerIdType).toBe("uuid");

	const loanInstallmentPayerType = await readColumnType(
		client,
		"loan_installments",
		"payer_id",
	);
	const loanOperationPayerType = await readColumnType(
		client,
		"loan_operations",
		"payer_id",
	);
	const loanPaymentPayerType = await readColumnType(
		client,
		"loan_payments",
		"payer_id",
	);

	expect(loanInstallmentPayerType).toBe(payerIdType);
	expect(loanOperationPayerType).toBe(payerIdType);
	expect(loanPaymentPayerType).toBe(payerIdType);

	const loanOperationIdType = await readColumnType(
		client,
		"loan_operations",
		"id",
	);
	const loanInstallmentIdType = await readColumnType(
		client,
		"loan_installments",
		"id",
	);
	const userIdType = await readColumnType(client, "user", "id");

	expect(userIdType).toBe("text");
	expect(await readColumnType(client, "institutions", "logo")).toBe("text");
	expect(await readColumnNullable(client, "institutions", "logo")).toEqual({
		isNullable: "YES",
		columnDefault: null,
	});
	expect(await readColumnType(client, "institutions", "user_id")).toBe(
		userIdType,
	);
	expect(
		await readColumnType(client, "loan_installments", "loan_operation_id"),
	).toBe(loanOperationIdType);
	expect(await readColumnType(client, "loan_installments", "user_id")).toBe(
		userIdType,
	);
	expect(
		await readColumnType(client, "loan_operations", "institution_id"),
	).toBe(await readColumnType(client, "institutions", "id"));
	expect(await readColumnType(client, "loan_operations", "user_id")).toBe(
		userIdType,
	);
	expect(
		await readColumnType(client, "loan_payments", "loan_operation_id"),
	).toBe(loanOperationIdType);
	expect(await readColumnType(client, "loan_payments", "installment_id")).toBe(
		loanInstallmentIdType,
	);
	expect(await readColumnType(client, "loan_payments", "user_id")).toBe(
		userIdType,
	);
	expect(await readColumnType(client, "loan_payments", "payer_id")).toBe(
		payerIdType,
	);
}

beforeAll(async () => {
	const client = new Client({ connectionString: DATABASE_URL });
	await client.connect();
	await client.query("SELECT 1");
	await client.end();
});

afterAll(() => {
	// no-op; databases are cleaned up per test.
});

describe("migration 0035 do loans", () => {
	it("faz clean install oficial até a 0035", async () => {
		await withTemporaryDatabase("loan-clean", async (client) => {
			await applyMigrations(client, CLEAN_INSTALL_MIGRATIONS);
			assertSnapshotMatchesMigration();
			await assertLoanSchema(client);
		});
	});

	it("faz upgrade sintético 0034 → 0035 preservando dados", async () => {
		await withTemporaryDatabase("loan-upgrade", async (client) => {
			await applyMigrations(client, JOURNAL_MIGRATIONS);

			const seeds = await seedPre0035Data(client);
			const userCountBefore = await readExactRowCount(client, "user");
			const payerCountBefore = await readExactRowCount(client, "pagadores");
			const institutionCountBefore = await readExactRowCount(
				client,
				"institutions",
			);

			await applySqlFile(client, MIGRATION_0035_PATH);

			assertSnapshotMatchesMigration();
			await assertLoanSchema(client);

			expect(await readExactRowCount(client, "user")).toBe(userCountBefore);
			expect(await readExactRowCount(client, "pagadores")).toBe(
				payerCountBefore,
			);
			expect(await readExactRowCount(client, "institutions")).toBe(
				institutionCountBefore,
			);

			const userRows = await client.query<{
				id: string;
				name: string;
				email: string;
			}>(`SELECT id, name, email FROM "user" WHERE id = $1`, [seeds.userId]);

			expect(userRows.rows).toEqual([
				{
					id: seeds.userId,
					name: "TEST_PRE_0035_USER",
					email: "test_pre_0035_user@example.com",
				},
			]);

			const payerRows = await client.query<{
				id: string;
				nome: string;
				share_code: string;
				user_id: string;
			}>(
				`SELECT id, nome, share_code, user_id FROM "pagadores" WHERE id = $1`,
				[seeds.payerId],
			);

			expect(payerRows.rows).toEqual([
				{
					id: seeds.payerId,
					nome: "TEST_PRE_0035_PAYER",
					share_code: "TEST_PRE_0035_SHARE",
					user_id: seeds.userId,
				},
			]);

			const institutionRows = await client.query<{
				id: string;
				name: string;
				logo: string | null;
				user_id: string;
			}>(`SELECT id, name, logo, user_id FROM "institutions" WHERE id = $1`, [
				seeds.institutionId,
			]);

			expect(institutionRows.rows).toEqual([
				{
					id: seeds.institutionId,
					name: "TEST_PRE_0035_INSTITUTION",
					logo: null,
					user_id: seeds.userId,
				},
			]);

			expect(await readColumnNullable(client, "institutions", "logo")).toEqual({
				isNullable: "YES",
				columnDefault: null,
			});
		});
	});
});
