// Copyright (c) 2025-2026 lívia
// SPDX-License-Identifier: AGPL-3.0-or-later

import { createRemoteClient, endpoint, remote, v } from "@july/snarl";
import { site } from "~/config/site.ts";
import {
	type ContributionDay,
	type ContributionSummary,
	isContributionsPayload,
} from "./types.ts";

export const SERVICE = "github";

const WEEKS_SHOWN = 42;
const TIMEOUT_MS = 8_000;

const contributionsApi = remote("https://github-contributions-api.jogruber.de/v4", {
	forUser: endpoint.get("/:user", {
		input: v({ user: v.string(), y: v.literal("last") }),
		output: v.guard(isContributionsPayload, "unexpected contributions shape"),
	}),
});

const client = createRemoteClient(contributionsApi, { timeout: TIMEOUT_MS });

function summarise(days: ContributionDay[]): ContributionSummary {
	return {
		days,
		total: days.reduce((sum, day) => sum + day.count, 0),
		from: days.at(0)?.date,
		to: days.at(-1)?.date,
	};
}

export async function fetchContributions(
	signal?: AbortSignal,
): Promise<ContributionSummary> {
	const payload = await client.forUser({ user: site.github.user, y: "last" }, { signal });

	const sorted = [...payload.contributions].sort((a, b) => a.date.localeCompare(b.date));
	return summarise(sorted.slice(-WEEKS_SHOWN * 7));
}
