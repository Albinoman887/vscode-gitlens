import type { TextEditor, Uri } from 'vscode';
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

	execute(editor?: TextEditor, uri?: Uri, ...args: any[]): void {
		// Check if first arg is a valid AIFeedbackContext (direct call scenario)
		// Otherwise, try to extract from active editor (toolbar scenario)
		const isValidContext =
			args.length > 0 && args[0] && typeof args[0] === 'object' && 'feature' in args[0] && 'model' in args[0];
		const context = isValidContext ? (args[0] as AIFeedbackContext) : this.extractFeedbackContext(editor, uri);
		if (!context) return;

		try {
			// For positive feedback, just send the event immediately without showing any form
			this.container.aiFeedback.sendFeedbackEvent(
				context,
				'positive',
				{
					presetReasons: [],
					writeInFeedback: '',
				},
				{ source: 'command' },
			);

			void window.showInformationMessage('Thank you for your feedback!');
		} catch (ex) {
			Logger.error(ex, 'AIFeedbackPositiveCommand', 'execute');
		}
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
			// For negative feedback, always show the detailed form directly
			await showDetailedFeedbackForm(this.container, context);
		} catch (ex) {
			Logger.error(ex, 'AIFeedbackNegativeCommand', 'execute');
		}
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

async function showDetailedFeedbackForm(container: Container, context: AIFeedbackContext): Promise<void> {
	const negativeReasons = [
		'Inaccurate or incorrect response',
		'Too generic or not specific enough',
		'Poor code quality',
		'Missing important details',
		'Difficult to understand',
		'Not relevant to my needs',
	];

	// Show quick pick for preset reasons
	const selectedReasons = await window.showQuickPick(
		negativeReasons.map(reason => ({ label: reason, picked: false })),
		{
			title: 'What specifically could be improved?',
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

	// Always send feedback submission telemetry for negative feedback
	container.aiFeedback.sendFeedbackEvent(
		context,
		'negative',
		{
			presetReasons: selectedReasons?.map(r => r.label),
			writeInFeedback: writeInFeedback,
		},
		{ source: 'command' },
	);

	void window.showInformationMessage('Thank you for your feedback!');
}
