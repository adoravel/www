// Copyright (c) 2025-2026 lívia
// SPDX-License-Identifier: AGPL-3.0-or-later

import { computed, css, isServer, signal } from "@404/aether";
import { createClient, ServiceError } from "@july/snarl/service";
import { ease, fontFamily, fontSize, media, radius, spacing, theme } from "~/tokens";
import { play } from "~/sound/mod.ts";
import AuthorAvatar, { PROVIDER_ICONS } from "~/components/inbox/author-avatar.tsx";
import PrintCard, { printCardStyles } from "~/components/inbox/print-card.tsx";
import { ArrowUpRight, Close, ImageIcon, Send } from "~/components/ui/icon.tsx";
import {
	type Attachment,
	pickImageFile,
	readImageFile,
} from "~/components/inbox/attachments.ts";
import {
	profileUrl,
	PROVIDER_LABELS,
	PROVIDERS,
	signInUrl,
} from "~/components/inbox/identity.ts";
import type { api } from "~/services/messages/mod.ts";
import type { Author, AuthorProvider, Print } from "~/services/messages/types.ts";

const client: ReturnType<typeof createClient<typeof api>> = createClient<typeof api>();

export interface ComposeProps {
	signOutEndpoint: string;
	returnTo: string;
	limit: number;
	locale: string;
	author: Author | null;
	notice?: string;
}

type Phase = "idle" | "printing" | "printed" | "error";

const ERRORS: Record<string, string> = {
	invalid: "Write something first.",
	signed_out: "Sign in with one of the buttons below to print.",
	unauthorised: "Sign in with one of the buttons below to print.",
	too_long: "That's a bit long for the printer.",
	rate_limited: "The printer needs a break, try again in a few minutes.",
	network: "Couldn't reach the printer, try again.",
};

const Styled = css`
	:scope {
		display: flex;
		flex-direction: column;
		gap: ${spacing[4]};
	}

	.compose {
		display: flex;
		flex-direction: column;
		border: 1px solid ${theme.surfaceBorder};
		border-radius: ${radius.lg};
		background: ${theme.surface};
		overflow: hidden;
		transition: border-color ${ease.fast};
	}

	.compose:focus-within {
		border-color: ${theme.surfaceBorderHover};
	}

	.bar-identity {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: ${spacing[2.5]};
		min-width: 0;
		flex: 1;
	}

	.bar-label {
		margin-right: ${spacing[1]};
		font-size: ${fontSize.sm};
		color: ${theme.textMuted};
	}

	.provider-button {
		display: inline-flex;
		align-items: center;
		gap: ${spacing[1.5]};
		padding: ${spacing[1]} ${spacing[2]};
		margin: 0 calc(${spacing[1]} * -1);
		border-radius: ${radius.sm};
		font-size: ${fontSize.sm};
		color: ${theme.text};
		opacity: 0.55;
		transition: opacity ${ease.fast}, background-color ${ease.fast};
	}

	.provider-button:hover,
	.provider-button:focus-visible,
	.provider-button[aria-pressed="true"] {
		opacity: 1;
		background-color: ${theme.surfaceHover};
	}

	.provider-button:disabled {
		opacity: 0.4;
		cursor: progress;
	}

	.provider-separator {
		color: ${theme.textMuted};
		user-select: none;
	}

	.handle-field {
		position: relative;
		display: inline-flex;
		width: 14rem;
		max-width: 100%;
	}

	.handle-input {
		width: 100%;
		height: ${spacing[7]};
		padding: 0 ${spacing[8]} 0 ${spacing[2.5]};
		border: 1px solid ${theme.surfaceBorder};
		border-radius: ${radius.md};
		background: ${theme.base};
		color: ${theme.text};
		font: inherit;
		font-size: ${fontSize.xs};
		outline: none;
		transition: border-color ${ease.fast};
	}

	.handle-input:focus {
		border-color: ${theme.surfaceBorderHover};
	}

	.handle-input::placeholder {
		color: ${theme.textMuted};
	}

	.handle-submit {
		position: absolute;
		top: 3px;
		right: 3px;
		display: grid;
		place-items: center;
		width: calc(${spacing[7]} - 6px);
		height: calc(${spacing[7]} - 6px);
		border-radius: ${radius.sm};
		color: ${theme.text};
		opacity: 0.55;
		transition: opacity ${ease.fast}, background-color ${ease.fast};
	}

	.handle-submit:hover,
	.handle-submit:focus-visible {
		opacity: 1;
		background-color: ${theme.surfaceHover};
	}

	.handle-submit:disabled {
		opacity: 0.25;
		cursor: not-allowed;
	}

	.author-avatar-link {
		display: inline-flex;
		border-radius: ${radius.full};
	}

	.author-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		line-height: 1.25;
	}

	.author-name {
		display: inline-flex;
		align-items: center;
		gap: ${spacing[1]};
		min-width: 0;
		font-size: ${fontSize.sm};
		font-weight: 500;
		color: ${theme.text};
		text-decoration: none;
		transition: color ${ease.hover};
	}

	a.author-name:hover,
	a.author-name:focus-visible {
		color: ${theme.accent};
	}

	.author-arrow {
		flex-shrink: 0;
		opacity: 0.5;
		transform: translate3d(0, 0, 0);
		transition: transform ${ease.hover}, opacity ${ease.hover};
	}

	a.author-name:hover .author-arrow,
	a.author-name:focus-visible .author-arrow {
		opacity: 1;
		transform: translate3d(1px, -1px, 0);
	}

	.author-handle {
		color: ${theme.textMuted};
	}

	.author-handle-row {
		display: inline-flex;
		align-items: center;
		gap: ${spacing[1.5]};
		font-size: ${fontSize.xs};
		color: ${theme.textMuted};
	}

	.author-signout-form {
		display: inline-flex;
	}

	.author-signout {
		padding: 0;
		font-size: ${fontSize.xs};
		color: ${theme.textMuted};
		text-decoration: underline;
		text-decoration-color: transparent;
		text-underline-offset: 3px;
		transition: color ${ease.fast}, text-decoration-color ${ease.fast};
	}

	.author-signout:hover,
	.author-signout:focus-visible {
		color: ${theme.text};
		text-decoration-color: currentColor;
	}

	.compose-input {
		width: 100%;
		min-height: 5.5rem;
		max-height: 20rem;
		padding: ${spacing[4]} ${spacing[5]};
		border: none;
		outline: none;
		resize: none;
		background: transparent;
		color: ${theme.text};
		font: inherit;
		font-size: ${fontSize.body};
		line-height: 1.6;
		field-sizing: content;
	}

	.compose-input::placeholder {
		color: ${theme.textMuted};
	}

	.compose-attachment {
		position: relative;
		display: inline-block;
		margin: 0 ${spacing[5]} ${spacing[4]};
	}

	.attachment-preview {
		display: block;
		max-width: 14rem;
		max-height: 10rem;
		border: 1px solid ${theme.surfaceBorder};
		border-radius: ${radius.md};
		background: ${theme.base};
		object-fit: contain;
	}

	.attachment-remove {
		position: absolute;
		top: ${spacing[1.5]};
		right: ${spacing[1.5]};
		display: grid;
		place-items: center;
		width: ${spacing[6]};
		height: ${spacing[6]};
		border-radius: ${radius.full};
		background: rgba(9, 9, 11, 0.72);
		color: #fff;
		box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.18);
		backdrop-filter: blur(4px);
		transition: background-color ${ease.fast}, transform ${ease.snap};
	}

	.attachment-remove:hover,
	.attachment-remove:focus-visible {
		background: rgba(9, 9, 11, 0.92);
		transform: scale(1.06);
	}

	.tool-button {
		display: grid;
		place-items: center;
		width: ${spacing[7]};
		height: ${spacing[7]};
		border-radius: ${radius.sm};
		color: ${theme.text};
		opacity: 0.55;
		transition: opacity ${ease.fast}, background-color ${ease.fast};
	}

	.tool-button:hover,
	.tool-button:focus-visible {
		opacity: 1;
		background-color: ${theme.surfaceHover};
	}

	.tool-button:disabled {
		opacity: 0.25;
		cursor: default;
	}

	.compose-bar {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: ${spacing[3]};
		padding: ${spacing[3]} ${spacing[3]} ${spacing[3]} ${spacing[4]};
		border-top: 1px solid ${theme.surfaceBorder};
	}

	.compose-count {
		font-family: ${fontFamily.mono};
		font-size: ${fontSize.xs};
		color: ${theme.textMuted};
		font-variant-numeric: tabular-nums;
	}

	.compose-count[data-over="true"] {
		color: ${theme.danger};
	}

	.compose-submit {
		display: inline-flex;
		align-items: center;
		gap: ${spacing[2]};
		height: 2.125rem;
		padding: 0 ${spacing[4]};
		border-radius: ${radius.md};
		background: ${theme.buttonBg};
		color: ${theme.buttonText};
		font-size: ${fontSize.sm};
		font-weight: 600;
		transform: translate3d(0, 0, 0);
		transition: background-color ${ease.fast}, transform ${ease.snap}, opacity
			${ease
				.fast};
	}

	.compose-submit:hover {
		background: ${theme.buttonBgHover};
	}

	.compose-submit:active {
		transform: scale(0.97);
	}

	.compose-submit:disabled {
		opacity: 0.6;
		cursor: progress;
	}

	.compose-honeypot {
		position: absolute;
		left: -9999px;
		width: 1px;
		height: 1px;
		opacity: 0;
	}

	.compose-error {
		font-size: ${fontSize.sm};
		color: ${theme.danger};
	}

	.printed {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: ${spacing[5]};
		padding: ${spacing[4]} 0 ${spacing[2]};
	}

	.printed-again {
		font-size: ${fontSize.sm};
		color: ${theme.textMuted};
		text-decoration: underline;
		text-underline-offset: 3px;
		transition: color ${ease.fast};
	}

	.printed-again:hover,
	.printed-again:focus-visible {
		color: ${theme.text};
	}

	${media.reducedMotion} {
		.compose-submit:active {
			transform: none;
		}
	}
`;

export default function Compose(
	{ signOutEndpoint, returnTo, limit, locale, author, notice }: ComposeProps,
) {
	if (isServer) printCardStyles.use();

	const body = signal("");
	const website = signal("");
	const phase = signal<Phase>(notice ? "error" : "idle");
	const error = signal(notice ?? "");
	const printed = signal<{ print: Print } | null>(null);
	const attachment = signal<Attachment | null>(null);

	const who = signal<Author | null>(author);
	const pendingProvider = signal<AuthorProvider | null>(null);
	const blueskyHandle = signal("");
	const choosingBluesky = signal(false);

	const count = computed(() => body().length);
	const over = computed(() => count() > limit);
	const busy = computed(() => phase() === "printing");
	const canPrint = computed(() => who() !== null && !busy());

	function connect(provider: AuthorProvider): void {
		if (pendingProvider.peek()) return;
		if (provider === "bluesky" && !choosingBluesky.peek()) {
			choosingBluesky(true);
			return;
		}
		choosingBluesky(false);
		if (provider === "bluesky" && !blueskyHandle.peek().trim()) {
			choosingBluesky(true);
			return;
		}
		pendingProvider(provider);
		location.assign(signInUrl(provider, returnTo, blueskyHandle.peek()));
	}

	function fail(reason: string, message?: string): void {
		error(message ?? ERRORS[reason] ?? ERRORS.network);
		phase("error");
	}

	async function submit(): Promise<void> {
		if (busy.peek()) return;
		if (!who.peek()) return fail("signed_out");
		const text = body.peek().trim();
		const image = attachment.peek()?.dataUrl;
		if (!text && !image) return fail("invalid");
		if (over.peek()) return fail("too_long");

		phase("printing");
		error("");
		play("print");

		try {
			const receipt = await client.messages({
				body: text,
				image,
				website: website.peek(),
			});
			printed({
				print: {
					id: receipt.id,
					number: receipt.number,
					body: text,
					printedAt: receipt.printedAt,
					author: who.peek() ?? undefined,
					image: receipt.image,
				},
			});
			phase("printed");
			play("success");
		} catch (caught) {
			if (caught instanceof ServiceError) {
				return fail(caught.code, caught.code === "invalid" ? caught.message : undefined);
			}
			fail("network");
		}
	}

	function reset(): void {
		body("");
		attachment(null);
		printed(null);
		error("");
		phase("idle");
	}

	async function attachImage(): Promise<void> {
		const file = await pickImageFile();
		if (!file) return;
		try {
			attachment({ kind: "image", dataUrl: await readImageFile(file) });
			error("");
			if (phase.peek() === "error") phase("idle");
		} catch (cause) {
			error(cause instanceof Error ? cause.message : ERRORS.network);
			phase("error");
		}
	}

	const providerButton = (provider: AuthorProvider) => {
		const Mark = PROVIDER_ICONS[provider];
		return (
			<button
				type="button"
				class="provider-button"
				aria-pressed={choosingBluesky.map((value) =>
					String(provider === "bluesky" && value)
				)}
				disabled={pendingProvider.map((value) => value !== null)}
				on:click={() => connect(provider)}
			>
				<Mark size={14} />
				{pendingProvider.map((value) =>
					value === provider ? "connecting…" : PROVIDER_LABELS[provider]
				)}
			</button>
		);
	};

	return (
		<Styled.div>
			<show when={phase.map((value) => value !== "printed")}>
				<form
					class="compose"
					on:submit={(event) => {
						event.preventDefault();
						void submit();
					}}
				>
					<label class="sr-only" for="compose-body">Your message</label>
					<textarea
						id="compose-body"
						class="compose-input"
						placeholder="send me anything!"
						rows={3}
						maxlength={limit * 2}
						bind:value={body}
						disabled={busy}
					/>
					<show when={attachment}>
						{(item: Attachment) => (
							<div class="compose-attachment">
								<img class="attachment-preview" src={item.dataUrl} alt="" />
								<button
									type="button"
									class="attachment-remove"
									aria-label="Remove image"
									title="Remove image"
									on:click={() => attachment(null)}
								>
									<Close size={13} strokeWidth={2.5} />
								</button>
							</div>
						)}
					</show>
					<div class="compose-bar">
						<show
							when={who}
							fallback={
								<div class="bar-identity">
									<span class="bar-label">sign in with</span>
									{PROVIDERS.flatMap((provider, index) => [
										index > 0 && (
											<span class="provider-separator" aria-hidden="true">·</span>
										),
										providerButton(provider),
									])}
									<show when={choosingBluesky}>
										<span class="handle-field">
											<input
												class="handle-input"
												type="text"
												placeholder="you.bsky.social"
												autocomplete="off"
												spellcheck="false"
												aria-label="Bluesky handle"
												bind:value={blueskyHandle}
												on:keydown={(event) => {
													if (event.key === "Enter") {
														event.preventDefault();
														connect("bluesky");
													}
												}}
											/>
											<button
												type="button"
												class="handle-submit"
												aria-label="Continue with Bluesky"
												disabled={blueskyHandle.map((value) => !value.trim())}
												on:click={() => connect("bluesky")}
											>
												<Send size={13} strokeWidth={2.25} />
											</button>
										</span>
									</show>
								</div>
							}
						>
							{(author: Author) => {
								const href = profileUrl(author);
								const Chip = href ? "a" : "span";
								return (
									<div class="bar-identity">
										<Chip
											class="author-avatar-link"
											href={href}
											target={href ? "_blank" : undefined}
											rel={href ? "noopener noreferrer" : undefined}
											tabindex={href ? "-1" : undefined}
										>
											<AuthorAvatar author={author} size={26} />
										</Chip>
										<span class="author-text">
											<Chip
												class="author-name"
												href={href}
												target={href ? "_blank" : undefined}
												rel={href ? "noopener noreferrer" : undefined}
											>
												{author.displayName ?? author.handle}
												{href && (
													<ArrowUpRight
														class="author-arrow"
														size={11}
														strokeWidth={2.5}
													/>
												)}
											</Chip>
											<span class="author-handle-row">
												<span class="author-handle">@{author.handle}</span>
												<span aria-hidden="true">·</span>
												<form
													method="post"
													action={signOutEndpoint}
													class="author-signout-form"
												>
													<button type="submit" class="author-signout">sign out</button>
												</form>
											</span>
										</span>
									</div>
								);
							}}
						</show>
						<button
							type="button"
							class="tool-button"
							aria-label="Add an image"
							title="Add an image"
							disabled={busy}
							on:click={() => void attachImage()}
						>
							<ImageIcon size={15} />
						</button>
						<span class="compose-count" data-over={over.map(String)} aria-live="polite">
							{count}/{limit}
						</span>
						<button
							class="compose-submit"
							type="submit"
							disabled={canPrint.map((value) => !value)}
							data-silent=""
						>
							{busy.map((value) => value ? "printing…" : "print")}
						</button>
					</div>
				</form>
				<show when={error}>
					<p class="compose-error" role="alert">{error}</p>
				</show>
			</show>

			<show when={printed}>
				{(result) => (
					<div class="printed" role="status" aria-live="polite">
						<PrintCard print={result.print} locale={locale} />
						<button class="printed-again" type="button" on:click={reset}>
							send another message
						</button>
					</div>
				)}
			</show>
		</Styled.div>
	);
}
