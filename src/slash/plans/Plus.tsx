import type { ReactNode } from "react";
import { go } from "../route.ts";
import { noteWords, usePlan } from "./plan.ts";
import "./plans.css";

/** A small sewn-on patch that says a thing belongs to Plus. It marks; it never blocks. */
export function PlusPatch({ label }: { label?: string }) {
  const { plan } = usePlan();
  return (
    <span className="pl-patch">
      <svg viewBox="0 0 12 12" width="10" height="10" aria-hidden="true">
        <path d="M6 .6l1.3 4.1 4.1 1.3-4.1 1.3L6 11.4 4.7 7.3.6 6l4.1-1.3z" fill="currentColor" />
      </svg>
      {label || plan?.names.plus || "Plus"}
    </span>
  );
}

/**
 * The patch with a line beside it, for a spot where a Plus line begins. A Free
 * household reads how much of the limit is used; anyone else reads what Free
 * would be, so the split can be seen while everything is open. `says` puts
 * the line in the screen’s own words where the table’s would read oddly.
 */
export function PlusNote({ feature, says }: { feature: string; says?: string }) {
  const sight = usePlan();
  const words = says && sight.marked(feature) ? says : noteWords(sight, feature);
  if (!words) return null;
  return (
    <p className="pl-note">
      <PlusPatch />
      <span>{words}</span>
    </p>
  );
}

/**
 * Shown in place when a Free household meets a limit. It says what is on the
 * other side and offers the Plans page, and the rest of the screen carries on.
 */
export function PlusCard({ feature, message, children }: { feature: string; message?: string; children?: ReactNode }) {
  const sight = usePlan();
  const line = sight.feature(feature);
  const words = message || line?.nudge || "";
  return (
    <aside className="pl-card" aria-label={`${line?.title || "This"}: part of Plus`}>
      <p className="pl-card-head">
        <PlusPatch />
        <strong>{line?.title || "Part of Plus"}</strong>
      </p>
      {words ? <p>{words}</p> : null}
      {children}
      <button className="pl-see" type="button" onClick={() => go("/plans")}>
        See plans
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <path d="M6 3.5 10.5 8 6 12.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </aside>
  );
}
