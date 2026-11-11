/** Writing tools that can share one account. HuManuScript is the only live sync client. */

export const WRITING_TOOLS = [
  { id: 'humanuscript', name: 'HuManuScript', sync: true },
  { id: 'speakfiction', name: 'SpeakFiction', sync: false },
];

export const APP_RETURN_URL = 'humanuscript://open';

export function writingTool(id) {
  return WRITING_TOOLS.find((tool) => tool.id === id) ?? null;
}
