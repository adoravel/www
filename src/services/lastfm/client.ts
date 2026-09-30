// Copyright (c) 2025-2026 lívia
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createRemoteClient, endpoint, remote, ServiceError, v } from "@july/snarl";
import { readEnv } from "~/services/core/env.ts";
import { asList } from "~/services/core/validate.ts";
import { site } from "~/config/site.ts";
import { blurhash } from "~/services/media/blurhash.ts";
import { proxied } from "~/services/media/proxy.ts";
import {
	IMAGE_SIZES,
	isErrorPayload,
	isRecentTracksPayload,
	type LastFmImage,
	type LastFmTrack,
	type Song,
} from "./types.ts";

export const SERVICE = "last.fm";

const API_KEY = readEnv("LASTFM_API_KEY", "6ed42890522918c59b5459a65ece5818");
const TIMEOUT_MS = 8_000;

const lastfmApi = remote("https://ws.audioscrobbler.com/2.0", {
	recentTracks: endpoint.get("/", {
		input: v({
			method: v.literal("user.getRecentTracks"),
			user: v.string(),
			limit: v.number(),
			extended: v.number(),
			api_key: v.string(),
			format: v.literal("json"),
		}),
		output: v.union(
			v.guard(isErrorPayload, "last.fm api error"),
			v.guard(isRecentTracksPayload, "unexpected recent tracks shape"),
		),
	}),
});

const client = createRemoteClient(lastfmApi, { timeout: TIMEOUT_MS });

function getLargestImage(images: LastFmImage[] | undefined): string | undefined {
	if (!images?.length) return undefined;

	const ranked = [...images].sort(
		(a, b) => IMAGE_SIZES.indexOf(b.size) - IMAGE_SIZES.indexOf(a.size),
	);
	return ranked.find((image) => image["#text"])?.["#text"];
}

function computeScrobbleTime(uts: string | undefined): string | undefined {
	if (!uts) return undefined;
	const seconds = Number(uts);
	return Number.isFinite(seconds) ? new Date(seconds * 1000).toISOString() : undefined;
}

export function toSong(track: LastFmTrack): Song {
	return {
		title: track.name,
		artist: track.artist.name,
		album: track.album["#text"],
		url: track.url,
		coverUrl: getLargestImage(track.image),
		loved: track.loved === "1",
		playing: track["@attr"]?.nowplaying === "true",
		plays: 1,
		scrobbledAt: computeScrobbleTime(track.date?.uts),
	};
}

export async function fetchRecentTracks(
	limit: number,
	signal?: AbortSignal,
): Promise<Song[]> {
	if (!API_KEY) {
		throw new ServiceError("internal", "LASTFM_API_KEY is not set");
	}

	const payload = await client.recentTracks({
		method: "user.getRecentTracks",
		user: site.lastfm.user,
		limit,
		extended: 1,
		api_key: API_KEY,
		format: "json",
	}, { signal });

	if (isErrorPayload(payload)) {
		throw new ServiceError("internal", `api error ${payload.error}: ${payload.message}`);
	}

	const songs = collapseRepeats(asList(payload.recenttracks.track).map(toSong));
	return await withCovers(songs, signal);
}

function computeSongKey(song: Song): string {
	return song.url || `${song.artist}\u0000${song.title}`.toLowerCase();
}

export function collapseRepeats(songs: Song[]): Song[] {
	const seen = new Map<string, Song>();
	for (const song of songs) {
		const key = computeSongKey(song);
		const existing = seen.get(key);
		if (existing) {
			existing.plays += 1;
			existing.loved ||= song.loved;
		} else {
			seen.set(key, { ...song });
		}
	}
	return [...seen.values()];
}

const COVER_SIZE = 320;

async function withCovers(songs: Song[], signal?: AbortSignal): Promise<Song[]> {
	const covers = [
		...new Set(songs.flatMap((song) => song.coverUrl ? [song.coverUrl] : [])),
	];
	const resolved = new Map(
		await Promise.all(
			covers.map(async (url) =>
				[url, {
					blurhash: await blurhash(url, signal),
					local: await proxied(url, { size: COVER_SIZE, fit: "cover" }, signal),
				}] as const
			),
		),
	);

	return songs.map((song) => {
		if (!song.coverUrl) return song;
		const cover = resolved.get(song.coverUrl);
		return {
			...song,
			coverUrl: cover?.local ?? song.coverUrl,
			coverBlurhash: cover?.blurhash,
		};
	});
}
