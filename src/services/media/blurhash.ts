// Copyright (c) 2025-2026 lívia
// SPDX-License-Identifier: AGPL-3.0-or-later

import { decode, encode, isBlurhashValid } from "blurhash";
import { log } from "@july/snarl/verbosity";
import { describeError } from "~/services/core/errors.ts";
import { decodeThumbnail } from "./image.ts";
import { cacheImage } from "./proxy.ts";

const SAMPLE_SIZE = 32;
const COMPONENTS_X = 4;
const COMPONENTS_Y = 4;
const FETCH_TIMEOUT_MS = 6_000;
const CACHE_LIMIT = 500;

const cache = new Map<string, string | null>();
const pending = new Map<string, Promise<string | undefined>>();

function remember(url: string, hash: string | null): void {
	if (cache.size >= CACHE_LIMIT) {
		const oldest = cache.keys().next().value;
		if (oldest !== undefined) cache.delete(oldest);
	}
	cache.set(url, hash);
}

async function computeBlurhash(
	url: string,
	signal?: AbortSignal,
): Promise<string | undefined> {
	const cached = await cacheImage(url, {}, signal);
	let bytes: Uint8Array;
	if (cached) {
		bytes = await Deno.readFile(cached.file);
	} else {
		const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
		const response = await fetch(url, {
			signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
		});
		if (!response.ok) {
			await response.body?.cancel();
			return undefined;
		}
		bytes = new Uint8Array(await response.arrayBuffer());
	}

	const image = await decodeThumbnail(bytes, SAMPLE_SIZE);
	return encode(image.data, image.width, image.height, COMPONENTS_X, COMPONENTS_Y);
}

export function blurhash(
	url: string,
	signal?: AbortSignal,
): Promise<string | undefined> {
	const cached = cache.get(url);
	if (cached !== undefined) return Promise.resolve(cached ?? undefined);

	const inFlight = pending.get(url);
	if (inFlight) return inFlight;

	const task = computeBlurhash(url, signal)
		.then((hash) => {
			remember(url, hash ?? null);
			return hash;
		})
		.catch((error) => {
			if (!signal?.aborted) {
				log.warn("media/blurhash", `skipped ${url}: ${describeError(error)}`);
				remember(url, null);
			}
			return undefined;
		})
		.finally(() => pending.delete(url));

	pending.set(url, task);
	return task;
}

function bmpFromRgba(
	pixels: Uint8ClampedArray,
	width: number,
	height: number,
): Uint8Array {
	const rowBytes = (width * 3 + 3) & ~3;
	const pixelBytes = rowBytes * height;
	const headerBytes = 54;
	const bytes = new Uint8Array(headerBytes + pixelBytes);
	const view = new DataView(bytes.buffer);

	bytes[0] = 0x42;
	bytes[1] = 0x4d;
	view.setUint32(2, bytes.length, true);
	view.setUint32(10, headerBytes, true);
	view.setUint32(14, 40, true);
	view.setInt32(18, width, true);
	view.setInt32(22, height, true);
	view.setUint16(26, 1, true);
	view.setUint16(28, 24, true);
	view.setUint32(34, pixelBytes, true);
	view.setInt32(38, 2835, true);
	view.setInt32(42, 2835, true);

	for (let y = 0; y < height; y++) {
		const rowStart = headerBytes + (height - 1 - y) * rowBytes;
		for (let x = 0; x < width; x++) {
			const i = (y * width + x) * 4;
			const o = rowStart + x * 3;
			bytes[o] = pixels[i + 2];
			bytes[o + 1] = pixels[i + 1];
			bytes[o + 2] = pixels[i];
		}
	}

	return bytes;
}

function toBase64(bytes: Uint8Array): string {
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

const dataUrlCache = new Map<string, string>();

export function blurhashToDataUrl(
	hash: string,
	width = 12,
	height = 12,
): string | undefined {
	if (!isBlurhashValid(hash).result) return undefined;

	const key = `${hash}:${width}x${height}`;
	const cached = dataUrlCache.get(key);
	if (cached) return cached;

	const pixels = decode(hash, width, height);
	const url = `data:image/bmp;base64,${toBase64(bmpFromRgba(pixels, width, height))}`;

	if (dataUrlCache.size >= CACHE_LIMIT) dataUrlCache.clear();
	dataUrlCache.set(key, url);
	return url;
}
