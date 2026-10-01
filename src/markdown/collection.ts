// Copyright (c) 2025-2026 lívia
// SPDX-License-Identifier: AGPL-3.0-or-later

import { join } from "@std/path";
import { log } from "@july/snarl/verbosity";
import Markdoc, { type Config } from "@markdoc/markdoc";
import { parse as parseYaml } from "@std/yaml";
import { type MarkdocComponentMap, renderMarkdoc } from "./markdoc.ts";
import { parseMarkdown } from "./extensions.ts";
import type {
	Frontmatter,
	MarkdownDocument,
	ThoughtSummary,
	Visibility,
} from "./types.ts";
import { isProduction } from "~/services/core/env.ts";

interface CacheEntry {
	mtime: number;
	frontmatter: Frontmatter;
	source: string;
	readingTime: number;
}

const WORDS_PER_MINUTE = 200;
const VISIBILITIES: readonly Visibility[] = ["public", "unlisted", "draft"];

function estimateReadingTime(source: string): number {
	const words = source
		.replace(/^---[\s\S]*?---/, "")
		.replace(/```[\s\S]*?```/g, "")
		.replace(/`[^`]+`/g, "")
		.replace(/[#*_~>`|![\]()]+/g, "")
		.split(/\s+/)
		.filter(Boolean).length;

	return Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}

function asDate(value: unknown): Date | undefined {
	if (value instanceof Date) return Number.isNaN(value.getTime()) ? undefined : value;
	if (typeof value !== "string") return undefined;

	const parsed = new Date(value);
	return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

function asStringList(value: unknown): string[] | undefined {
	if (!Array.isArray(value)) return undefined;
	return value.filter((item): item is string => typeof item === "string");
}

function parseFrontmatter(raw: unknown): Frontmatter | null {
	if (typeof raw !== "object" || raw === null) return null;
	const value = raw as Record<string, unknown>;

	const createdAt = asDate(value.createdAt);
	if (typeof value.title !== "string" || !createdAt) return null;

	const visibility = VISIBILITIES.includes(value.visibility as Visibility)
		? value.visibility as Visibility
		: undefined;

	return {
		title: value.title,
		summary: typeof value.summary === "string" ? value.summary : undefined,
		description: typeof value.description === "string" ? value.description : undefined,
		createdAt,
		updatedAt: asDate(value.updatedAt),
		tags: asStringList(value.tags),
		cover: typeof value.cover === "string" ? value.cover : undefined,
		visibility,
	};
}

export interface MarkdownCollectionOptions {
	dir: string;
	components?: MarkdocComponentMap;
	config?: Omit<Config, "variables">;
	includeDrafts?: boolean;
}

export interface MarkdownCollection {
	get(slug: string): Promise<MarkdownDocument | null>;
	all(): Promise<MarkdownDocument[]>;
	summaries(limit?: number): Promise<ThoughtSummary[]>;
	canonicalSlug(input: string): string;
}

const FILE_NAME_RE = /^(?:\d{4}_\d{2}_\d{2}@)?(.+)\.md$/;

export function normaliseSlug(input: string): string {
	return input
		.normalize("NFKD")
		.replace(/[\u0300-\u036f]/g, "")
		.toLowerCase()
		.replace(/^\d{4}_\d{2}_\d{2}@/, "")
		.replace(/[^a-z0-9]+/g, "-")
		.replace(/^-+|-+$/g, "");
}

function slugFromFileName(fileName: string): string | null {
	const match = FILE_NAME_RE.exec(fileName);
	return match ? normaliseSlug(match[1]) : null;
}

export function toSummary(document: MarkdownDocument): ThoughtSummary {
	const { frontmatter } = document;
	return {
		slug: document.slug,
		title: frontmatter.title,
		excerpt: frontmatter.summary ?? frontmatter.description,
		createdAt: frontmatter.createdAt.toISOString(),
		readingTime: document.readingTime,
		tags: frontmatter.tags ?? [],
		draft: frontmatter.visibility === "draft",
	};
}

export function createMarkdownCollection(
	options: MarkdownCollectionOptions,
): MarkdownCollection {
	const { dir, includeDrafts = true } = options;
	const cache = new Map<string, CacheEntry>();

	async function fileIndex(): Promise<Map<string, string>> {
		const index = new Map<string, string>();
		try {
			for await (const entry of Deno.readDir(dir)) {
				if (!entry.isFile) continue;
				const slug = slugFromFileName(entry.name);
				if (!slug) continue;
				if (index.has(slug)) {
					log.warn(
						"content/markdown",
						`duplicate slug "${slug}" (${entry.name} ignored)`,
					);
					continue;
				}
				index.set(slug, entry.name);
			}
		} catch (error) {
			if (!(error instanceof Deno.errors.NotFound)) throw error;
		}
		return index;
	}

	async function loadEntry(slug: string, fileName: string): Promise<CacheEntry | null> {
		const path = join(dir, fileName);

		let stat: Deno.FileInfo;
		try {
			stat = await Deno.stat(path);
		} catch {
			return null;
		}

		const mtime = stat.mtime?.getTime() ?? 0;
		const cached = cache.get(slug);
		if (cached && cached.mtime === mtime) return cached;

		const source = await Deno.readTextFile(path);
		const ast = parseMarkdown(source);
		const raw = ast.attributes.frontmatter ? parseYaml(ast.attributes.frontmatter) : {};

		const frontmatter = parseFrontmatter(raw);
		if (!frontmatter) {
			log.warn(
				"content/markdown",
				`"${slug}.md" is missing required frontmatter (title, createdAt)`,
			);
			cache.delete(slug);
			return null;
		}

		const entry: CacheEntry = {
			mtime,
			frontmatter,
			source,
			readingTime: estimateReadingTime(source),
		};
		cache.set(slug, entry);
		return entry;
	}

	function toDocument(slug: string, entry: CacheEntry): MarkdownDocument {
		return {
			slug,
			frontmatter: entry.frontmatter,
			readingTime: entry.readingTime,
			render: () => {
				const ast = parseMarkdown(entry.source);
				const content = Markdoc.transform(ast, {
					...options.config,
					variables: { frontmatter: entry.frontmatter },
				});
				return renderMarkdoc(content, options.components ?? {});
			},
		};
	}

	function isVisible(entry: CacheEntry, listing: boolean): boolean {
		const visibility = entry.frontmatter.visibility ?? "public";
		if (visibility === "draft") return includeDrafts;
		if (visibility === "unlisted") return !listing;
		return true;
	}

	async function all(): Promise<MarkdownDocument[]> {
		const index = await fileIndex();
		const loaded = await Promise.all(
			[...index].map(async ([slug, fileName]) => ({
				slug,
				entry: await loadEntry(slug, fileName),
			})),
		);

		return loaded
			.filter((item): item is { slug: string; entry: CacheEntry } =>
				item.entry !== null && isVisible(item.entry, true)
			)
			.map(({ slug, entry }) => toDocument(slug, entry))
			.sort((a, b) =>
				b.frontmatter.createdAt.getTime() - a.frontmatter.createdAt.getTime()
			);
	}

	return {
		async get(input) {
			const slug = normaliseSlug(input);
			const fileName = (await fileIndex()).get(slug);
			if (!fileName) return null;

			const entry = await loadEntry(slug, fileName);
			if (!entry || !isVisible(entry, false)) return null;
			return toDocument(slug, entry);
		},
		canonicalSlug: normaliseSlug,
		all,
		async summaries(limit) {
			const documents = await all();
			return (limit === undefined ? documents : documents.slice(0, limit)).map(toSummary);
		},
	};
}
