// Copyright (c) 2025-2026 lívia
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createRemoteClient, endpoint, remote, v } from "@july/snarl";
import { ServiceError } from "~/services/core/errors.ts";
import { hasShape, isString, nullable, optional } from "~/services/core/validate.ts";
import type { Author } from "~/services/messages/types.ts";
import { getCallbackUrl, providerConfig, SERVICE } from "./config.ts";
import { cleanDisplayName } from "./names.ts";

const AUTHORISE_URL = "https://discord.com/oauth2/authorize";
const CDN = "https://cdn.discordapp.com";

const isToken = hasShape({ access_token: isString, token_type: isString });

const isUser = hasShape({
	id: isString,
	username: isString,
	global_name: optional(nullable(isString)),
	avatar: nullable(isString),
	discriminator: optional(isString),
});

const discordApi = remote("https://discord.com/api/v10", {
	token: endpoint.post("https://discord.com/api/oauth2/token", {
		input: v({ grant_type: v.string(), code: v.string(), redirect_uri: v.string() }),
		output: v.guard(isToken, "unexpected discord token shape"),
		body: "form",
	}),
	me: endpoint.get("/users/@me", {
		output: v.guard(isUser, "unexpected discord user shape"),
	}),
});

const client = createRemoteClient(discordApi, { timeout: 8_000 });

function credentials(): { clientId: string; clientSecret: string } {
	const { clientId, clientSecret } = providerConfig.discord;
	if (!clientId || !clientSecret) {
		throw new ServiceError(SERVICE, "config", "discord oauth is not configured");
	}
	return { clientId, clientSecret };
}

export function createDiscordAuthorisationUrl(origin: string, state: string): string {
	const { clientId } = credentials();
	const url = new URL(AUTHORISE_URL);
	url.searchParams.set("response_type", "code");
	url.searchParams.set("client_id", clientId);
	url.searchParams.set("scope", "identify");
	url.searchParams.set("state", state);
	url.searchParams.set("redirect_uri", getCallbackUrl(origin, "discord"));
	url.searchParams.set("prompt", "none");
	return url.href;
}

function avatarUrl(
	user: { id: string; avatar: string | null; discriminator?: string },
): string {
	if (user.avatar) {
		const extension = user.avatar.startsWith("a_") ? "gif" : "webp";
		return `${CDN}/avatars/${user.id}/${user.avatar}.${extension}?size=128`;
	}
	const index = user.discriminator && user.discriminator !== "0"
		? Number(user.discriminator) % 5
		: Number((BigInt(user.id) >> 22n) % 6n);
	return `${CDN}/embed/avatars/${index}.png`;
}

export async function completeDiscord(origin: string, code: string): Promise<Author> {
	const { clientId, clientSecret } = credentials();

	const token = await client.token({
		grant_type: "authorization_code",
		code,
		redirect_uri: getCallbackUrl(origin, "discord"),
	}, { headers: { authorization: `Basic ${btoa(`${clientId}:${clientSecret}`)}` } });

	const user = await client.me(undefined, {
		headers: { authorization: `${token.token_type} ${token.access_token}` },
	});

	return {
		provider: "discord",
		id: user.id,
		handle: user.username,
		displayName: cleanDisplayName(user.global_name ?? undefined, user.username),
		avatarUrl: avatarUrl(user),
	};
}
