// Copyright (c) 2025-2026 lívia
// SPDX-License-Identifier: AGPL-3.0-or-later

import { readNumberEnv } from "~/services/core/env.ts";
import { createPoller, type PolledResource } from "~/services/core/poller.ts";
import { blurhash } from "~/services/media/blurhash.ts";
import { proxied } from "~/services/media/proxy.ts";
import {
	reading,
	type ReadingEntry,
	type ReadingKind,
	type ReadingStatus,
} from "~/content/reading.ts";

export const SERVICE = "reading";

export interface ReadingItem {
	title: string;
	author: string;
	kind: ReadingKind;
	status: ReadingStatus;
	url?: string;
	coverUrl?: string;
	coverBlurhash?: string;
	note?: string;
}

const COVER_SIZE = 480;
const OPEN_LIBRARY_COVERS = "https://covers.openlibrary.org/b/isbn";
const OPEN_LIBRARY_BOOKS = "https://openlibrary.org/isbn";

function getCoverFor(entry: ReadingEntry): string | undefined {
	if (entry.cover) return entry.cover;
	if (entry.isbn) return `${OPEN_LIBRARY_COVERS}/${entry.isbn}-L.jpg?default=false`;
	return undefined;
}

function getLinkFor(entry: ReadingEntry): string | undefined {
	if (entry.url) return entry.url;
	if (entry.isbn) return `${OPEN_LIBRARY_BOOKS}/${entry.isbn}`;
	return undefined;
}

async function loadReading(signal: AbortSignal): Promise<ReadingItem[]> {
	return await Promise.all(
		reading.map(async (entry) => {
			const source = getCoverFor(entry);
			return {
				title: entry.title,
				author: entry.author,
				kind: entry.kind,
				status: entry.status ?? "to-read",
				url: getLinkFor(entry),
				coverUrl: source
					? await proxied(source, { size: COVER_SIZE }, signal)
					: undefined,
				coverBlurhash: source ? await blurhash(source, signal) : undefined,
				note: entry.note,
			};
		}),
	);
}

export const readingList: PolledResource<ReadingItem[]> = createPoller({
	name: SERVICE,
	intervalSeconds: readNumberEnv("READING_POLL_INTERVAL", 6 * 60 * 60),
	load: loadReading,
});

export type { ReadingKind, ReadingStatus } from "~/content/reading.ts";
