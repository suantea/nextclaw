/**
 * Preset templates for quick provider configuration.
 * Each template pre-fills apiBase and optionally apiKey placeholder.
 */

export type ProviderTemplate = {
  id: string;
  displayName: string;
  apiBase: string;
  apiKeyPlaceholder: string;
  description: string;
};

export const FREELLMAPI_TEMPLATE: ProviderTemplate = {
  id: 'freellmapi',
  displayName: 'FreeLLM API',
  apiBase: 'https://api.freellmapi.com/v1',
  apiKeyPlaceholder: 'sk-xxxxxxxxxxxxxxxx',
  description: '免费聚合端点，OpenAI 兼容协议',
};

export const PROVIDER_TEMPLATES: ProviderTemplate[] = [FREELLMAPI_TEMPLATE];

export function getProviderTemplateById(id: string): ProviderTemplate | undefined {
  return PROVIDER_TEMPLATES.find((t) => t.id === id);
}
