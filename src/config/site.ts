// Copyright (c) 2025-2026 lívia
// SPDX-License-Identifier: AGPL-3.0-or-later

import { readEnv } from "~/services/core/env.ts";

const lastfmUser = readEnv("LASTFM_USER", "satisfeita");
const githubUser = readEnv("GITHUB_USER", "adoravel");

export const site = {
	name: "lívia",
	handle: "kyu.re",
	timezone: "America/Sao_Paulo",
	locale: "en-US",
	email: "k@kyu.re",
	description: "one of the girls of all time",
	bio:
		"I'm an aspiring computer engineer passionate about open access and well-crafted software. I really love linguistics, functional programming, the C programming language, and unconventional TypeScript.",
	lastfm: {
		user: lastfmUser,
		profileUrl: `https://last.fm/user/${lastfmUser}`,
	},
	github: {
		user: githubUser,
		profileUrl: `https://github.com/${githubUser}`,
	},
	support: {
		kofi: "https://ko-fi.com/west",
		githubSponsors: `https://github.com/sponsors/${githubUser}`,
	},
	avatar: {
		src: "/profile-picture.webp",
		artist: "ゆぅ",
		platform: "Pixiv",
		href: "https://pixivfe.ducks.party/artworks/145940730",
	},
} as const;

export const routes = {
	home: "/",
	more: "/more",
	resume: "/resume",
	resumePdf: "/resume.pdf",
	writing: (slug: string) => `/writing/${slug}`,
	signOut: "/auth/signout",
} as const;

export function pageTitle(title?: string): string {
	return title ? `${title} · ${site.name}` : site.name;
}
