import type { MessageItem, TextEditor, Uri } from 'vscode';
import { window } from 'vscode';
import type { AIFeedbackContext } from '../ai/aiFeedbackService';
import { Schemes } from '../constants';
import type { Container } from '../container';
import type { MarkdownContentMetadata } from '../documents/markdown';
import { decodeGitLensRevisionUriAuthority } from '../git/gitUri.authority';
import { command } from '../system/-webview/command';
import { Logger } from '../system/logger';
import { ActiveEditorCommand } from './commandBase';
import { getCommandUri } from './commandBase.utils';

export interface AIFeedbackCommandArgs {
	context: AIFeedbackContext;
}

@command()
export class AIFeedbackPositiveCommand extends ActiveEditorCommand {
	constructor(private readonly container: Container) {
		super('gitlens.ai.feedback.positive');
	}

	async execute(editor?: TextEditor, uri?: Uri, ...args: any[]): Promise<void> {
		// Check if first arg is a valid AIFeedbackContext (direct call scenario)
		// Otherwise, try to extract from active editor (toolbar scenario)
		const isValidContext =
			args.length > 0 && args[0] && typeof args[0] === 'object' && 'feature' in args[0] && 'model' in args[0];
		const context = isValidContext ? (args[0] as AIFeedbackContext) : this.extractFeedbackContext(editor, uri);
		if (!context) return;

		try {
			// Send positive rating telemetry
			this.container.aiFeedback.sendRatingEvent(context, 'positive', { source: 'command' });

			// Show optional feedback form
			await this.showFeedbackForm(context, 'positive');
		} catch (ex) {
			Logger.error(ex, 'AIFeedbackPositiveCommand', 'execute');
		}
	}

	private async showFeedbackForm(context: AIFeedbackContext, rating: 'positive' | 'negative'): Promise<void> {
		await showFeedbackForm(this.container, context, rating);
	}

	private extractFeedbackContext(editor?: TextEditor, uri?: Uri): AIFeedbackContext | undefined {
		uri = getCommandUri(uri, editor);
		if (uri?.scheme !== Schemes.GitLensMarkdown) return undefined;

		const authority = uri.authority;
		if (!authority) return undefined;

		try {
			const metadata = decodeGitLensRevisionUriAuthority<MarkdownContentMetadata>(authority);

			// Extract feedback context from metadata
			if (metadata.feedbackContext) {
				return metadata.feedbackContext as unknown as AIFeedbackContext;
			}

			return undefined;
		} catch (ex) {
			Logger.error(ex, 'AIFeedbackPositiveCommand', 'extractFeedbackContext');
			return undefined;
		}
	}
}

@command()
export class AIFeedbackNegativeCommand extends ActiveEditorCommand {
	constructor(private readonly container: Container) {
		super('gitlens.ai.feedback.negative');
	}

	async execute(editor?: TextEditor, uri?: Uri, ...args: any[]): Promise<void> {
		// Check if first arg is a valid AIFeedbackContext (direct call scenario)
		// Otherwise, try to extract from active editor (toolbar scenario)
		const isValidContext =
			args.length > 0 && args[0] && typeof args[0] === 'object' && 'feature' in args[0] && 'model' in args[0];
		const context = isValidContext ? (args[0] as AIFeedbackContext) : this.extractFeedbackContext(editor, uri);
		if (!context) return;

		try {
			// Send negative rating telemetry
			this.container.aiFeedback.sendRatingEvent(context, 'negative', { source: 'command' });

			// Show feedback form
			await this.showFeedbackForm(context, 'negative');
		} catch (ex) {
			Logger.error(ex, 'AIFeedbackNegativeCommand', 'execute');
		}
	}

	private async showFeedbackForm(context: AIFeedbackContext, rating: 'positive' | 'negative'): Promise<void> {
		await showFeedbackForm(this.container, context, rating);
	}

	private extractFeedbackContext(editor?: TextEditor, uri?: Uri): AIFeedbackContext | undefined {
		uri = getCommandUri(uri, editor);
		if (uri?.scheme !== Schemes.GitLensMarkdown) return undefined;

		const authority = uri.authority;
		if (!authority) return undefined;

		try {
			const metadata = decodeGitLensRevisionUriAuthority<MarkdownContentMetadata>(authority);

			// Extract feedback context from metadata
			if (metadata.feedbackContext) {
				return metadata.feedbackContext as unknown as AIFeedbackContext;
			}

			return undefined;
		} catch (ex) {
			Logger.error(ex, 'AIFeedbackNegativeCommand', 'extractFeedbackContext');
			return undefined;
		}
	}
}

// Shared feedback form logic
async function showFeedbackForm(
	container: Container,
	context: AIFeedbackContext,
	rating: 'positive' | 'negative',
): Promise<void> {
	const submitFeedbackItem: MessageItem = { title: 'Tell us more' };
	const skipItem: MessageItem = { title: 'Skip', isCloseAffordance: true };

	const result = await window.showInformationMessage(
		`Thank you for your feedback! Would you like to tell us more about what ${rating === 'positive' ? 'worked well' : 'could be improved'}?`,
		{ modal: false },
		submitFeedbackItem,
		skipItem,
	);

	if (result === submitFeedbackItem) {
		await showDetailedFeedbackForm(container, context, rating);
	}
}

async function showDetailedFeedbackForm(
	container: Container,
	context: AIFeedbackContext,
	rating: 'positive' | 'negative',
): Promise<void> {
	const positiveReasons = [
		'Accurate and helpful response',
		'Saved me time',
		'Easy to understand',
		'Good code quality',
		'Appropriate level of detail',
	];

	const negativeReasons = [
		'Inaccurate or incorrect response',
		'Too generic or not specific enough',
		'Poor code quality',
		'Missing important details',
		'Difficult to understand',
		'Not relevant to my needs',
	];

	const reasons = rating === 'positive' ? positiveReasons : negativeReasons;

	// Show quick pick for preset reasons
	const selectedReasons = await window.showQuickPick(
		reasons.map(reason => ({ label: reason, picked: false })),
		{
			title: `What specifically ${rating === 'positive' ? 'worked well' : 'could be improved'}?`,
			canPickMany: true,
			placeHolder: 'Select all that apply (optional)',
		},
	);

	// Show input box for additional feedback
	const writeInFeedback = await window.showInputBox({
		title: 'Additional feedback (optional)',
		placeHolder: 'Tell us more about your experience...',
		prompt: 'Your feedback helps us improve our AI features',
	});

	// Send feedback submission telemetry if any feedback was provided
	if ((selectedReasons && selectedReasons.length > 0) || (writeInFeedback && writeInFeedback.trim().length > 0)) {
		container.aiFeedback.sendFeedbackSubmittedEvent(
			context,
			rating,
			{
				presetReasons: selectedReasons?.map(r => r.label),
				writeInFeedback: writeInFeedback,
			},
			{ source: 'command' },
		);

		void window.showInformationMessage('Thank you for your feedback!');
	}
}
