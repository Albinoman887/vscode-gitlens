import type { Disposable, TextDocument, TextEditor } from 'vscode';
import { window, workspace } from 'vscode';
import { Schemes } from '../constants';
import type { Container } from '../container';
import type { MarkdownContentMetadata } from '../documents/markdown';
import { decodeGitLensRevisionUriAuthority } from '../git/gitUri.authority';
import { setContext } from '../system/-webview/context';
import { debug } from '../system/decorators/log';

/**
 * Tracks when a GitLens markdown document with feedback context is active
 * and sets the appropriate context variable for toolbar button visibility
 */
export class MarkdownFeedbackTracker implements Disposable {
	private readonly _disposables: Disposable[] = [];
	private _currentHasFeedback = false;

	constructor(private readonly container: Container) {
		// Listen for text editor changes (for when editing markdown source)
		this._disposables.push(window.onDidChangeActiveTextEditor(this.onActiveEditorChanged, this));

		// Listen for document opens (for when markdown documents are opened)
		this._disposables.push(workspace.onDidOpenTextDocument(this.onDocumentOpened, this));

		// Listen for visible text editors changes (for when preview becomes active)
		this._disposables.push(window.onDidChangeVisibleTextEditors(this.onVisibleEditorsChanged, this));

		// Check initial state
		this.checkCurrentState();
	}

	dispose(): void {
		this._disposables.forEach(d => {
			d.dispose();
		});
		// Clear context on disposal
		void setContext('gitlens:markdown:feedback:available', false);
	}

	@debug()
	private onActiveEditorChanged(editor: TextEditor | undefined): void {
		console.log('MarkdownFeedbackTracker: Active editor changed', {
			hasEditor: Boolean(editor),
			scheme: editor?.document.uri.scheme,
		});
		this.checkCurrentState();
	}

	@debug()
	private onDocumentOpened(document: TextDocument): void {
		console.log('MarkdownFeedbackTracker: Document opened', {
			scheme: document.uri.scheme,
			authority: document.uri.authority,
		});
		if (document.uri.scheme === Schemes.GitLensMarkdown) {
			this.checkCurrentState();
		}
	}

	@debug()
	private onVisibleEditorsChanged(editors: readonly TextEditor[]): void {
		console.log('MarkdownFeedbackTracker: Visible editors changed', {
			count: editors.length,
			schemes: editors.map(e => e.document.uri.scheme),
		});
		this.checkCurrentState();
	}

	private checkCurrentState(): void {
		// Check all open documents for GitLens markdown with feedback context
		const hasFeedback = this.checkForFeedbackDocuments();

		console.log('MarkdownFeedbackTracker: Checking current state', {
			hasFeedback: hasFeedback,
			telemetryEnabled: this.container.telemetry.enabled,
		});

		if (hasFeedback !== this._currentHasFeedback) {
			this._currentHasFeedback = hasFeedback;
			console.log('MarkdownFeedbackTracker: Setting context to', hasFeedback);
			void setContext('gitlens:markdown:feedback:available', hasFeedback);
		}
	}

	private checkForFeedbackDocuments(): boolean {
		// Check all open documents for GitLens markdown with feedback context
		for (const document of workspace.textDocuments) {
			if (this.documentHasFeedback(document)) {
				return true;
			}
		}
		return false;
	}

	private documentHasFeedback(document: TextDocument): boolean {
		const uri = document.uri;
		if (uri.scheme !== Schemes.GitLensMarkdown) return false;

		const authority = uri.authority;
		if (!authority) return false;

		try {
			const metadata = decodeGitLensRevisionUriAuthority<MarkdownContentMetadata>(authority);

			// Check if document has feedback context AND telemetry is enabled
			const hasFeedbackContext = Boolean(metadata.feedbackContext);
			const telemetryEnabled = this.container.telemetry.enabled;

			console.log('MarkdownFeedbackTracker: Checking document feedback context', {
				uri: uri.toString(),
				hasFeedbackContext: hasFeedbackContext,
				telemetryEnabled: telemetryEnabled,
				metadata: metadata.feedbackContext ? 'present' : 'missing',
			});

			return hasFeedbackContext && telemetryEnabled;
		} catch (error) {
			console.log('MarkdownFeedbackTracker: Error decoding metadata', error);
			return false;
		}
	}
}
