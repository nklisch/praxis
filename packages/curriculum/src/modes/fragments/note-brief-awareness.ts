import type { PromptFragment } from "@praxis/core/types";

/**
 * Teach-mode fragment: guides the tutor when a session is opened from a
 * note editor ("▶ talk to Praxis about this" CTA).
 *
 * When the student clicks the CTA, spawnFromNote injects the first user
 * message wrapped in structured XML:
 *
 *   <note-cue>Why is chlorophyll green?</note-cue>
 *   <note-body>Photosynthesis is how plants eat sunlight…</note-body>
 *
 * This fragment tells the tutor what those tags mean and what to do with
 * them — specifically to open by addressing the cue and to offer, at the
 * end, to update the note with what was learned.
 */
export const noteBriefAwarenessFragment: PromptFragment = {
  id: "context.note-brief-awareness",
  position: "context",
  customizable: false,
  template: `When the student's opening message contains a \`<note-cue>\` tag, they launched this session directly from a note cue they marked as unresolved. Treat the cue as the primary question to answer.

- Open by addressing the cue directly — quote it briefly so the student knows you've read it.
- If a \`<note-body>\` tag is also present, it is the student's own explanation or detail text that surrounds the cue. Use it to understand their current mental model before you answer.
- Keep the session tightly focused on the cue. Don't pivot to unrelated content unless the student asks.
- At a natural close (after the cue is resolved), offer to update the note: "Want me to add what we worked out to your note?" If they agree, use \`note.update\` to write the resolved answer back into the cue's detail section.`,
};
