// Copyright (c) 2025-2026 lívia
// SPDX-License-Identifier: AGPL-3.0-or-later

export interface MessageInput {
	body: string;
	image?: string;
	website?: string;
}

export type AuthorProvider = "discord" | "bluesky" | "lastfm";

export interface Author {
	provider: AuthorProvider;
	id?: string;
	handle: string;
	displayName?: string;
	avatarUrl?: string;
}

export interface Print {
	id: string;
	number: string;
	body: string;
	printedAt: string;
	author?: Author;
	image?: string;
}

export interface StoredMessage extends Print {
	author: Author;
	client: string;
}

export interface Receipt {
	id: string;
	number: string;
	printedAt: string;
	characters: number;
	image?: string;
}
