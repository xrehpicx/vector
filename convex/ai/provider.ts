import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { withProviderMetadataAnnotations } from './language_model_wrappers';

export const openrouter = createOpenRouter({
  apiKey: process.env.OPENROUTER_API_KEY || '',
  compatibility: 'strict',
});

export const defaultAssistantModel =
  process.env.OPENROUTER_MODEL?.trim() || 'moonshotai/kimi-k2.5:nitro';

export function assertAssistantModelConfigured(): void {
  if (!process.env.OPENROUTER_API_KEY?.trim()) {
    throw new Error(
      'Assistant is temporarily unavailable because OPENROUTER_API_KEY is not configured.',
    );
  }
}

export const openrouterChatWithAnnotations = (
  modelId: string,
  settings?: Parameters<typeof openrouter.chat>[1],
) => withProviderMetadataAnnotations(openrouter.chat(modelId, settings));

export const openrouterLanguageModelWithAnnotations = (
  modelId: string,
  settings?: Parameters<typeof openrouter.languageModel>[1],
) =>
  withProviderMetadataAnnotations(openrouter.languageModel(modelId, settings));

export const openrouterCompletionWithAnnotations = (
  modelId: string,
  settings?: Parameters<typeof openrouter.completion>[1],
) => withProviderMetadataAnnotations(openrouter.completion(modelId, settings));
