// Copyright (c) 2025-2026 lívia
// SPDX-License-Identifier: AGPL-3.0-or-later

import { css, Head } from "@404/aether";
import type { Context } from "@july/snarl";
import { getFooter } from "~/components/layout/footer-state.ts";
import {
	boundaries,
	ease,
	elevation,
	fontFamily,
	fontSize,
	media,
	palette,
	radius,
	spacing,
	stagger,
	theme,
	themeStyles,
} from "~/tokens";
import { initTheme, THEME_TRANSITION_ATTRIBUTE } from "~/storage/theme.ts";
import { site } from "~/config/site.ts";
import SiteFooter from "~/components/layout/site-footer.tsx";
import { webButtons } from "~/services/buttons/mod.ts";
import SoundEffects from "~/components/layout/sound-effects.tsx";

const noise = encodeURIComponent(
	`<svg viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
	<filter id="noise">
		<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="4" stitchTiles="stitch" />
	</filter>
	<rect width="100%" height="100%" filter="url(#noise)"/>
</svg>`,
);

const revealSteps = Array.from(
	{ length: 8 },
	(_, step) => `body > main > :nth-child(${step + 1}) { --reveal-step: ${step}; }`,
).join("\n");

const styles = css`
	*,
	*::before,
	*::after {
		box-sizing: border-box;
		padding: 0;
		margin: 0;
	}

	html {
		font-family: ${fontFamily.default};
		font-size: ${fontSize.root};
		line-height: ${boundaries.lineHeight};
		-webkit-font-smoothing: antialiased;
		-moz-osx-font-smoothing: grayscale;
		text-rendering: optimizeLegibility;
		scroll-behavior: smooth;
		color-scheme: light dark;
	}

	html[data-theme="light"] {
		color-scheme: light;
	}

	html[data-theme="dark"] {
		color-scheme: dark;
	}

	body {
		background-color: ${theme.base};
		color: ${theme.text};
		min-height: 100dvh;
	}

	html[${THEME_TRANSITION_ATTRIBUTE}] body,
	html[${THEME_TRANSITION_ATTRIBUTE}] body *,
	html[${THEME_TRANSITION_ATTRIBUTE}] body *::before,
	html[${THEME_TRANSITION_ATTRIBUTE}] body *::after {
		transition:
			background-color 0.4s ease,
			color 0.4s ease,
			border-color 0.4s ease,
			outline-color 0.4s ease !important;
	}

	::-webkit-scrollbar-track {
		background: transparent;
	}
	::-webkit-scrollbar-thumb {
		background: ${theme.lift};
		border-radius: ${radius.full};
	}
	::-webkit-scrollbar-thumb:hover {
		background: ${palette.theme.gray600};
	}

	a {
		color: inherit;
		text-decoration: none;
	}

	button {
		font: inherit;
		border: none;
		background: none;
		cursor: pointer;
		color: inherit;
	}

	img,
	svg {
		display: block;
		max-width: 100%;
	}

	code,
	pre,
	kbd {
		font-family: ${fontFamily.mono};
	}

	h1,
	h2,
	h3 {
		font-weight: 600;
		line-height: 1.25;
		letter-spacing: -0.01em;
		text-wrap: balance;
	}

	:focus-visible {
		outline: 2px solid ${theme.accent};
		outline-offset: 2px;
	}

	[data-x-props] {
		display: contents;
	}

	@media (max-width: ${boundaries.mobileMaxWidth}) {
		.only-desktop {
			display: none;
		}
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	.skip-link {
		position: absolute;
		top: ${spacing[2]};
		left: ${spacing[2]};
		z-index: ${elevation.toast};
		padding: ${spacing[2]} ${spacing[3]};
		border-radius: ${radius.md};
		background: ${theme.text};
		color: ${theme.base};
		font-weight: 600;
		transform: translateY(-200%);
		transition: transform 0.15s ease;
	}

	.skip-link:focus-visible {
		transform: none;
	}

	@view-transition {
		navigation: auto;
	}

	body::before {
		content: "";
		position: fixed;
		inset: 0;
		z-index: 9999;
		pointer-events: none;
		opacity: 0.015;
		background-image: url("data:image/svg+xml,${noise}");
	}

	body > main {
		max-width: ${boundaries.maxWidth};
		margin: 0 auto;
		padding: ${spacing[16]} ${spacing[4]} ${spacing[20]};
		display: flex;
		flex-direction: column;
		gap: ${spacing.section};
		overflow-x: hidden;
	}

	body > main > * {
		position: relative;
		overflow-anchor: none;
		animation: reveal ${ease.reveal} both;
		animation-delay: calc(var(--reveal-step, 0) * ${stagger.normal});
	}

	@keyframes reveal {
		from {
			opacity: 0;
			top: ${spacing[4]};
		}
		to {
			opacity: 1;
			top: 0;
		}
	}

	@media (max-width: ${boundaries.mobileMaxWidth}) {
		body > main {
			padding-top: ${spacing[10]};
			gap: ${spacing[16]};
		}
	}

	${media.reducedMotion} {
		html {
			scroll-behavior: auto;
		}

		body > main > * {
			animation: reveal-reduced 0.35s ease both;
			animation-delay: 0s;
		}

		@keyframes reveal-reduced {
			from {
				opacity: 0;
			}
			to {
				opacity: 1;
			}
		}

		.skip-link {
			transition: none;
		}
	}

	@media (pointer: fine) {
		html,
		body {
			scrollbar-color: ${theme.accentBorder} ${theme.base};
		}
	}

	${revealSteps}
`;

export default function RootLayout(
	{ children, ctx }: { children: unknown; ctx?: Context },
) {
	return (
		<styles.html lang="en">
			<Head>
				<meta charset="utf-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1" />
				<link rel="icon" type="image/png" href="/favicon.png" />
				<meta name="view-transition" content="same-origin" />
				<title>{site.name}</title>
				<meta name="description" content={site.description} />
				<meta property="og:title" content={site.name} />
				<meta property="og:type" content="profile" />
				<meta property="og:site_name" content={site.handle} />
				<meta property="og:description" content={site.description} />
				<meta property="og:image" content={site.avatar.src} />
				<meta property="og:image:type" content="image/webp" />
				<meta name="theme-color" content={palette.theme.base} />
				<link rel="stylesheet" href="/fonts/public-sans/index.css" />
				<style dangerouslySetInnerHTML={{ __html: themeStyles.raw }} />
				<noscript
					dangerouslySetInnerHTML={{
						__html: "<style>[data-needs-js]{display:none !important}</style>",
					}}
				/>
				<script dangerouslySetInnerHTML={{ __html: initTheme }} />
			</Head>
			<body>
				<a class="skip-link" href="#content">Skip to content</a>
				{children}
				<SiteFooter {...getFooter(ctx)} webButtons={webButtons.get()} />
				<SoundEffects />
			</body>
		</styles.html>
	);
}
