// Copyright (c) 2025-2026 lívia
// SPDX-License-Identifier: AGPL-3.0-or-later

import { log } from "@july/snarl/verbosity";
import { describeError, ServiceError } from "~/services/core/errors.ts";

export const SERVICE = "media";

export interface RgbaImage {
	width: number;
	height: number;
	data: Uint8ClampedArray;
}

type Sharp = typeof import("sharp").default;

let loader: Promise<Sharp | null> | undefined;

export function loadSharp(): Promise<Sharp | null> {
	return loader ??= import("sharp")
		.then((module) => module.default)
		.catch((err) => {
			log.warn(
				SERVICE,
				`sharp unavailable, blurhashes and image processing disabled: ${
					describeError(err).split("\n")[0]
				}`,
			);
			return null;
		});
}

export async function decodeThumbnail(
	bytes: Uint8Array,
	size: number,
): Promise<RgbaImage> {
	const sharp = await loadSharp();
	if (!sharp) throw new ServiceError(SERVICE, "config", "sharp is not available");

	const { data, info } = await sharp(bytes)
		.resize(size, size, { fit: "fill" })
		.ensureAlpha()
		.raw()
		.toBuffer({ resolveWithObject: true });

	return {
		width: info.width,
		height: info.height,
		data: new Uint8ClampedArray(data.buffer, data.byteOffset, data.length),
	};
}

export async function toWebp(
	bytes: Uint8Array,
	size: number,
	fit: "cover" | "inside" = "cover",
): Promise<Uint8Array | null> {
	const sharp = await loadSharp();
	if (!sharp) return null;

	const output = await sharp(bytes)
		.resize(size, size, { fit, withoutEnlargement: fit === "inside" })
		.webp({ quality: 82 })
		.toBuffer();
	return new Uint8Array(output.buffer, output.byteOffset, output.length);
}
