// Copyright (c) 2025-2026 lívia
// SPDX-License-Identifier: AGPL-3.0-or-later

import { Head } from "@404/aether";
import type { Context } from "@july/snarl";
import SiteHeader from "~/components/layout/site-header.tsx";
import { setFooter } from "~/components/layout/footer-state.ts";
import Section from "~/components/layout/section.tsx";
import RecentThoughts from "~/components/activity/recent-thoughts.tsx";
import Compose from "~/components/inbox/compose.tsx";
import PrintWall from "~/components/inbox/print-wall.tsx";
import ReadingShelf from "~/components/reading/reading-shelf.tsx";
import ContactLinks from "~/components/contact/contact-links.tsx";
import { thoughts } from "~/markdown/mod.ts";
import { pageTitle, routes, site } from "~/config/site.ts";
import { MESSAGE_LIMIT, recentPrints } from "~/services/messages/mod.ts";
import { readSession } from "~/services/auth/mod.ts";
import { touchAuthor } from "~/services/authors/mod.ts";
import { readingList } from "~/services/reading/mod.ts";

const AUTH_NOTICES: Record<string, string> = {
	unavailable: "That sign-in isn't set up yet.",
	denied: "Sign-in was cancelled.",
	state: "That sign-in link expired, try again.",
	failed: "Couldn't complete the sign-in, try again.",
};

export default async function More(ctx: Context) {
	setFooter(ctx, { buttons: true });

	const [summaries, prints, author, books] = await Promise.all([
		thoughts.summaries(),
		recentPrints(),
		readSession(ctx),
		readingList.ready.then(readingList.get),
	]);
	if (author) void touchAuthor(author);
	const authStatus = ctx.query.get("auth");
	const notice = authStatus ? AUTH_NOTICES[authStatus] : undefined;

	return (
		<main id="content">
			<Head>
				<title>{pageTitle("more")}</title>
				<meta
					name="description"
					content="Write-ups, a printer that takes messages, and other odds and ends."
				/>
			</Head>
			<SiteHeader current="more" />

			<Section title="Write-ups">
				{summaries.length > 0
					? <RecentThoughts thoughts={summaries} />
					: <p>Nothing written down yet.</p>}
			</Section>

			{books && books.length > 0 && (
				<Section title="To read">
					<ReadingShelf items={books} />
				</Section>
			)}

			<Section title="Send me anything" needsJs>
				<Compose
					signOutEndpoint={routes.signOut}
					returnTo={routes.more}
					limit={MESSAGE_LIMIT}
					locale={site.locale}
					author={author}
					notice={notice}
				/>
			</Section>

			{prints.length > 0 && (
				<Section title="Recent prints">
					<PrintWall prints={prints} locale={site.locale} />
				</Section>
			)}

			<Section title="Contact">
				<ContactLinks />
			</Section>
		</main>
	);
}

// {activity && activity.days.length > 0 && (
// 	<Section title="Code activity" class="only-desktop">
// 		<GitHubHeatmap contributions={activity} />
// 	</Section>
// )}
