// Copyright (c) 2025-2026 lívia
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createRemoteClient, endpoint, remote, v } from "@july/snarl";
import { log } from "@july/snarl/verbosity";
import { readOptionalEnv } from "~/services/core/env.ts";
import { PUBLIC_URL } from "~/services/auth/config.ts";
import type { Print } from "./types.ts";
import { SERVICE } from "./store.ts";

const WEBHOOK_URL = readOptionalEnv("DISCORD_WEBHOOK_URL");

const PROVIDER_COLOURS = {
	discord: 0x5865f2,
	bluesky: 0x1083fe,
	lastfm: 0xd51007,
} as const;

const client = WEBHOOK_URL
	? createRemoteClient(
		remote(WEBHOOK_URL, {
			notify: endpoint.post("", { input: v.any(), response: "none" }),
		}),
		{ timeout: 8_000 },
	)
	: undefined;

function absolute(url: string): string {
	return url.startsWith("/") ? `${PUBLIC_URL}${url}` : url;
}

export function isWebhookConfigured(): boolean {
	return client !== undefined;
}

export async function notifyPendingPrint(print: Print): Promise<void> {
	if (!client) {
		log.warn(SERVICE, "DISCORD_WEBHOOK_URL not set, print stays pending on disk only");
		return;
	}

	const author = print.author!;
	const line = JSON.stringify(print);
	const payload = {
		username: "printer",
		embeds: [
			{
				title: `print #${print.number} from ${author.displayName ?? author.handle}`,
				description: print.body.length > 1800
					? `${print.body.slice(0, 1800)}…`
					: print.body || (print.image ? "(image only)" : ""),
				color: PROVIDER_COLOURS[author.provider],
				thumbnail: author.avatarUrl ? { url: absolute(author.avatarUrl) } : undefined,
				image: print.image ? { url: absolute(print.image) } : undefined,
				fields: [
					{
						name: "account",
						value: `@${author.handle} · ${author.provider}`,
						inline: true,
					},
					{ name: "printed at", value: print.printedAt, inline: true },
				],
				footer: { text: "append the line below to prints.jsonl to publish" },
			},
		],
		content: `\`\`\`json\n${line}\n\`\`\``,
	};

	const result = await client.notify.attempt(payload);
	if (!result.ok) {
		log.warn(
			SERVICE,
			`webhook delivery failed for print ${print.id}: ${result.error.message}`,
		);
	}
}
