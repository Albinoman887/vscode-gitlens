import type { Disposable } from 'vscode';
import type { AIFeedbackRatingEvent, AIFeedbackSubmittedEvent, Source } from '../constants.telemetry';
import type { Container } from '../container';
import { debug, log } from '../system/decorators/log';

export interface AIFeedbackContext {
	feature: AIFeedbackRatingEvent['feature'];
	model: {
		id: string;
		providerId: string;
		providerName: string;
	};
	usage?: {
		promptTokens?: number;
		completionTokens?: number;
		totalTokens?: number;
	};
	duration?: number;
	inputLength?: number;
	outputLength?: number;
}

export class AIFeedbackService implements Disposable {
	constructor(private readonly container: Container) {}

	dispose(): void {
		// Nothing to dispose currently
	}

	@log()
	sendRatingEvent(context: AIFeedbackContext, rating: 'positive' | 'negative', source: Source): void {
		const eventData: AIFeedbackRatingEvent = {
			feature: context.feature,
			rating: rating,
			'model.id': context.model.id,
			'model.provider.id': context.model.providerId as any,
			'model.provider.name': context.model.providerName,
			'usage.promptTokens': context.usage?.promptTokens,
			'usage.completionTokens': context.usage?.completionTokens,
			'usage.totalTokens': context.usage?.totalTokens,
			duration: context.duration,
			'input.length': context.inputLength,
			'output.length': context.outputLength,
		};

		this.container.telemetry.sendEvent('ai/feedback/rating', eventData, source);
	}

	@log()
	sendFeedbackSubmittedEvent(
		context: AIFeedbackContext,
		rating: 'positive' | 'negative',
		feedback: {
			presetReasons?: string[];
			writeInFeedback?: string;
		},
		source: Source,
	): void {
		const hasPresetReasons = feedback.presetReasons && feedback.presetReasons.length > 0;
		const hasWriteIn = Boolean(feedback.writeInFeedback && feedback.writeInFeedback.trim().length > 0);

		let feedbackType: 'preset' | 'writeIn' | 'both';
		if (hasPresetReasons && hasWriteIn) {
			feedbackType = 'both';
		} else if (hasPresetReasons) {
			feedbackType = 'preset';
		} else {
			feedbackType = 'writeIn';
		}

		const eventData: AIFeedbackSubmittedEvent = {
			feature: context.feature,
			rating: rating,
			feedbackType: feedbackType,
			presetReason: hasPresetReasons ? feedback.presetReasons!.join(', ') : undefined,
			hasWriteInFeedback: hasWriteIn,
			'writeInFeedback.length': hasWriteIn ? feedback.writeInFeedback!.trim().length : undefined,
			'model.id': context.model.id,
			'model.provider.id': context.model.providerId as any,
			'model.provider.name': context.model.providerName,
			'usage.promptTokens': context.usage?.promptTokens,
			'usage.completionTokens': context.usage?.completionTokens,
			'usage.totalTokens': context.usage?.totalTokens,
			duration: context.duration,
			'input.length': context.inputLength,
			'output.length': context.outputLength,
		};

		this.container.telemetry.sendEvent('ai/feedback/submitted', eventData, source);
	}

	/**
	 * Creates feedback context from AI generation result data
	 */
	@debug()
	createFeedbackContext(
		feature: AIFeedbackRatingEvent['feature'],
		model: {
			id: string;
			providerId: string;
			providerName: string;
		},
		options?: {
			usage?: {
				promptTokens?: number;
				completionTokens?: number;
				totalTokens?: number;
			};
			duration?: number;
			inputLength?: number;
			outputLength?: number;
		},
	): AIFeedbackContext {
		return {
			feature: feature,
			model: model,
			usage: options?.usage,
			duration: options?.duration,
			inputLength: options?.inputLength,
			outputLength: options?.outputLength,
		};
	}

	/**
	 * Extracts feedback context from AI telemetry data
	 */
	@debug()
	createFeedbackContextFromTelemetry(
		feature: AIFeedbackRatingEvent['feature'],
		telemetryData: {
			'model.id': string;
			'model.provider.id': string;
			'model.provider.name': string;
			'usage.promptTokens'?: number;
			'usage.completionTokens'?: number;
			'usage.totalTokens'?: number;
			duration?: number;
			'input.length'?: number;
			'output.length'?: number;
		},
	): AIFeedbackContext {
		return {
			feature: feature,
			model: {
				id: telemetryData['model.id'],
				providerId: telemetryData['model.provider.id'],
				providerName: telemetryData['model.provider.name'],
			},
			usage: {
				promptTokens: telemetryData['usage.promptTokens'],
				completionTokens: telemetryData['usage.completionTokens'],
				totalTokens: telemetryData['usage.totalTokens'],
			},
			duration: telemetryData.duration,
			inputLength: telemetryData['input.length'],
			outputLength: telemetryData['output.length'],
		};
	}
}
