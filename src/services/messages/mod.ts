// Copyright (c) 2025-2026 lívia
// SPDX-License-Identifier: AGPL-3.0-or-later

import { type Context, service, ServiceError, v } from "@july/snarl";
import { log } from "@july/snarl/verbosity";
import { appendPending } from "./store.ts";
import { notifyPendingPrint } from "./webhook.ts";
import { storeAttachment } from "./attachments.ts";
import {
	describeError,
	ServiceError as LocalServiceError,
} from "~/services/core/errors.ts";
import { readSession } from "~/services/auth/mod.ts";
import type { Print, Receipt } from "./types.ts";

export const MESSAGE_LIMIT = 1_000;

const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX = 3;
const RATE_LIMIT_MAX_KEYS = 10_000;

function clean(value: string | undefined): { value?: string; tooLong?: boolean } {
	if (typeof value !== "string") return {};

	const trimmed = value.replace(/\r\n/g, "\n").trim();
	if (trimmed.length > MESSAGE_LIMIT) return { tooLong: true };

	return { value: trimmed || undefined };
}

async function hash(client: string): Promise<string> {
	const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(client));
	return Array.from(
		new Uint8Array(digest).slice(0, 8),
		(b) => b.toString(16).padStart(2, "0"),
	)
		.join("");
}

function computeReceiptNumber(id: string): string {
	let hash = 0;
	for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
	return String(1000 + (hash % 9000));
}

function clientOf(ctx: Context): string {
	const forwarded = ctx.request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
	return forwarded || ctx.sender.remoteAddr.hostname;
}

const writes = new Map<string, { count: number; reset: number }>();

const limited = service.guard(({ ctx }) => {
	const client = clientOf(ctx);
	const now = Date.now();

	const existing = writes.get(client);
	const entry = existing && now <= existing.reset
		? { count: existing.count + 1, reset: existing.reset }
		: { count: 1, reset: now + RATE_LIMIT_WINDOW_MS };

	writes.delete(client);
	writes.set(client, entry);

	if (writes.size > RATE_LIMIT_MAX_KEYS) {
		const oldest = writes.keys().next().value;
		if (oldest !== undefined) writes.delete(oldest);
	}
	if (entry.count > RATE_LIMIT_MAX) {
		throw new ServiceError(
			"rate_limited",
			"the printer needs a break, try again in a few minutes",
		);
	}

	return { client };
}, ["rate_limited"]);

const authed = limited.guard(async ({ ctx }) => {
	const author = await readSession(ctx);
	if (!author) throw new ServiceError("unauthorised", "sign in to print a message");
	return { author };
}, ["unauthorised"]);

export const api = service({
	messages: authed.mutation({
		input: v({
			body: v.string().optional(),
			image: v.string().optional(),
			website: v.string().optional(),
		}),
		handler: async ({ input, client, author }): Promise<Receipt> => {
			const body = clean(input.body);
			if (body.tooLong) {
				throw new ServiceError("invalid", "That's a bit long for the printer.");
			}
			if (!body.value && !input.image) {
				throw new ServiceError("invalid", "Write something first.");
			}

			const whatTheFuck = typeof input.website === "string" && input.website.length > 0;

			let image: string | undefined;
			if (input.image && !whatTheFuck) {
				try {
					image = await storeAttachment(input.image, "messages");
				} catch (error) {
					if (error instanceof LocalServiceError) {
						throw new ServiceError(
							"invalid",
							"That image didn't work, try a png, jpeg, gif, or webp.",
						);
					}
					throw error;
				}
			}

			const id = crypto.randomUUID();
			const print: Print = {
				id,
				number: computeReceiptNumber(id),
				body: body.value ?? "",
				printedAt: new Date().toISOString(),
				author,
				image,
			};

			if (!whatTheFuck) {
				await appendPending({ ...print, author, client: await hash(client) });
				await notifyPendingPrint(print);
			}

			return {
				id,
				number: print.number,
				printedAt: print.printedAt,
				characters: print.body.length,
				image,
			};
		},
	}),
}, {
	onError: (error, path, ctx) =>
		log.error(
			"messages",
			`unexpected error in ${path} from ${clientOf(ctx)}: ${describeError(error)}`,
		),
});

export { getRecentPrints as recentPrints, WALL_LIMIT } from "./wall.ts";
export { janitor, sweepUnapproved } from "./janitor.ts";
export type { Author, AuthorProvider, MessageInput, Print, Receipt } from "./types.ts";
