/**
 * Append synthetic close delimiters for unbalanced ``` code fences and $$
 * display-math pairs. Without this, a partial streaming message that contains
 * an opening fence would render the rest of the buffer as one giant fenced
 * block until the closing fence finally arrives.
 *
 * Inline marks (`**`, `*`, `_`, single `$`, `[`) are intentionally NOT balanced —
 * markdown treats them as literal characters when unclosed, which degrades
 * gracefully on its own.
 *
 * The synthetic close becomes harmless trailing whitespace inside the real
 * block once the genuine close arrives in a later token.
 */
export function balanceFences(input: string): string {
  let out = input;

  // Count fenced-code delimiters at line start (markdown allows up to 3
  // leading spaces of indent before a fence).
  const fenceCount = (out.match(/^[ \t]{0,3}```/gm) ?? []).length;
  if (fenceCount % 2 === 1) {
    out += out.endsWith("\n") ? "```\n" : "\n```\n";
  }

  // Display-math delimiters: split on `$$` and check if the count is odd.
  // Inline `$...$` math degrades to literal characters when unclosed and
  // does not need balancing.
  const dollarPairs = out.split("$$").length - 1;
  if (dollarPairs % 2 === 1) {
    out += "\n$$";
  }

  return out;
}
