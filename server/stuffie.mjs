import { GUIDES } from "./catalog.mjs";

/**
 * A person's stuffie: what it is called, and which of the four written voices
 * (lumen, pip, moss, sol) it speaks in. A stuffie someone made themselves keeps
 * its own name and species and borrows one of those voices.
 */
export function stuffieOf(user) {
  const made = user?.guideId === "custom" && user.stuffie ? user.stuffie : null;
  const guide = GUIDES.find((item) => item.id === (made ? made.voice : user?.guideId)) || GUIDES[0];
  return { voice: guide.id, name: made?.name || guide.name, species: made?.species || guide.species };
}
