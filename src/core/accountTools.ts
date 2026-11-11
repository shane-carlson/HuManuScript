/** Writing tools that share one account. HuManuScript is the live client. */

export const APP_RETURN_URL = 'humanuscript://open';

export const WRITING_TOOLS = [
  { id: 'humanuscript', name: 'HuManuScript', sync: true },
  { id: 'speakfiction', name: 'SpeakFiction', sync: false },
] as const;

export type WritingToolId = (typeof WRITING_TOOLS)[number]['id'];

export const THIS_WRITING_TOOL: WritingToolId = 'humanuscript';

export function writingTool(id: string) {
  return WRITING_TOOLS.find((tool) => tool.id === id) ?? null;
}
