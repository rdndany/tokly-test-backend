/**
 * Extract plain text from Lexical editor JSON (stored in project description, etc.)
 */

interface LexicalTextNode {
  type: "text";
  text?: string;
}

interface LexicalElementNode {
  type: string;
  children?: LexicalNode[];
}

type LexicalNode = LexicalTextNode | LexicalElementNode;

interface LexicalEditorState {
  root?: { children?: LexicalNode[] };
}

function extractTextFromNode(node: LexicalNode): string {
  if (!node) return "";
  if ((node as LexicalTextNode).type === "text") {
    return (node as LexicalTextNode).text ?? "";
  }
  const el = node as LexicalElementNode;
  if (el.children?.length) {
    return el.children.map(extractTextFromNode).join("");
  }
  return "";
}

/** Returns true if the string looks like Lexical JSON */
export function isLexicalJSON(value: string | undefined): boolean {
  if (!value || typeof value !== "string") return false;
  try {
    const parsed = JSON.parse(value);
    return (
      parsed &&
      typeof parsed === "object" &&
      parsed.root &&
      typeof parsed.root === "object" &&
      Array.isArray(parsed.root.children)
    );
  } catch {
    return false;
  }
}

/** Extract plain text from Lexical JSON. Returns original string if not Lexical. */
export function extractLexicalText(value: string | undefined): string {
  if (!value) return "";
  if (!isLexicalJSON(value)) return value;
  try {
    const state: LexicalEditorState = JSON.parse(value);
    const children = state.root?.children ?? [];
    return children.map(extractTextFromNode).join("\n").trim();
  } catch {
    return value;
  }
}

/** Create Lexical JSON from plain text (single paragraph). Used for hero text, etc. */
export function plainTextToLexicalJSON(plainText: string): string {
  const trimmed = plainText?.trim() ?? "";
  const paragraph: LexicalElementNode = {
    type: "paragraph",
    children: [{ type: "text", text: trimmed }],
  };
  const state: LexicalEditorState = {
    root: { children: [paragraph] },
  };
  return JSON.stringify(state);
}
