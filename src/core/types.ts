/** Block model from Speak Fiction's manuscript editor. */

export type BlockType = 'chapter' | 'scene' | 'section' | 'paragraph';

export type InlineMarkKind = 'bold' | 'italic' | 'underline' | 'strike';

export interface InlineMark {
  kind: InlineMarkKind;
  /** Inclusive start index in the plain string. */
  start: number;
  /** Exclusive end index in the plain string. */
  end: number;
}

export interface ManuscriptBlock {
  id: string;
  type: BlockType;
  /** Heading label. Empty for paragraphs. */
  title: string;
  /** Prose. Empty for headings. */
  text: string;
  marks: InlineMark[];
}
