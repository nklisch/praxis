/**
 * HtmlRenderer — renders HTML documents sanitised with DOMPurify.
 *
 * All HTML passes through DOMPurify before being injected into the DOM via
 * `dangerouslySetInnerHTML`. This strips script tags, event handlers, and
 * any other XSS vectors before the content is rendered.
 *
 * The sanitisation is verified by the XSS test in __tests__/html-renderer.test.tsx.
 */

import DOMPurify from "dompurify";
import type { JSX } from "react";
import type { RendererProps } from "./format-router.js";
import styles from "./html-renderer.module.css";

/**
 * Sanitise an HTML string with DOMPurify. Returns an empty string when the
 * input is empty; uses the default DOMPurify config which strips all
 * script tags, event handlers, and unsafe attributes.
 */
export function sanitizeHtml(html: string): string {
  if (!html) return "";
  // Use RETURN_TRUSTED_TYPE=false to get a plain string back.
  return DOMPurify.sanitize(html) as string;
}

export function HtmlRenderer({ doc }: RendererProps): JSX.Element {
  if (!doc.text) {
    return <p className={styles.empty}>No HTML content available for this document.</p>;
  }

  const clean = sanitizeHtml(doc.text);

  return (
    <div
      className={styles.container}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: content is sanitised by DOMPurify before injection
      dangerouslySetInnerHTML={{ __html: clean }}
    />
  );
}
