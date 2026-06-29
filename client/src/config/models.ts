import type { ModelOption, ReasoningEffortOption } from '../api'

export const DEFAULT_MODELS: ModelOption[] = [
  { id: 'gpt-5.5', label: 'GPT-5.5', full: 'GPT-5.5', sub: 'Best GPT for complex builds', provider: 'OpenAI', cost: 3, supportsReasoning: true, reasoningEfforts: ['low', 'medium', 'high', 'xhigh'] },
  { id: 'gpt-5.4', label: 'GPT-5.4', full: 'GPT-5.4', sub: 'Strong GPT at lower cost', provider: 'OpenAI', cost: 2, supportsReasoning: true, reasoningEfforts: ['low', 'medium', 'high', 'xhigh'] },
  { id: 'gpt-5.4-mini', label: 'GPT-5.4 mini', full: 'GPT-5.4 mini', sub: 'Affordable GPT option', provider: 'OpenAI', cost: 2, supportsReasoning: true, reasoningEfforts: ['low', 'medium', 'high', 'xhigh'] },
  { id: 'claude-opus-4-7', label: 'Opus 4.7', full: 'Claude Opus 4.7', sub: 'Best Claude for hard work', provider: 'Anthropic', cost: 5, supportsReasoning: true, reasoningEfforts: ['low', 'medium', 'high', 'xhigh', 'max'] },
  { id: 'claude-sonnet-4-6', label: 'Sonnet 4.6', full: 'Claude Sonnet 4.6', sub: 'Balanced Claude option', provider: 'Anthropic', cost: 2, supportsReasoning: true, reasoningEfforts: ['low', 'medium', 'high', 'max'] },
]

export const DEFAULT_REASONING_EFFORTS: Record<'openai' | 'anthropic', ReasoningEffortOption[]> = {
  openai: [
    { id: 'low', label: 'Low', sub: 'Faster, lower-cost reasoning' },
    { id: 'medium', label: 'Medium', sub: 'Balanced reasoning' },
    { id: 'high', label: 'High', sub: 'Deeper reasoning' },
    { id: 'xhigh', label: 'XHigh', sub: 'Hardest OpenAI tasks' },
  ],
  anthropic: [
    { id: 'low', label: 'Low', sub: 'Most efficient' },
    { id: 'medium', label: 'Medium', sub: 'Balanced token savings' },
    { id: 'high', label: 'High', sub: 'Claude default depth' },
    { id: 'xhigh', label: 'XHigh', sub: 'Long agentic work' },
    { id: 'max', label: 'Max', sub: 'Absolute maximum capability' },
  ],
}
