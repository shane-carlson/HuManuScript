import { useEffect, useState } from "react";
import { api } from "./api.ts";
import { useSession } from "./session.tsx";

const PREFIX = "photo:";
const loaded = new Map<string, string>();

/**
 * A photo from a finished task. On this computer it arrives inside the task;
 * a hosted server sends a reference instead, and the picture is fetched when shown.
 */
export function SharedPhoto({ src, alt }: { src: string; alt: string }) {
  const { token } = useSession();
  const kept = src.startsWith(PREFIX);
  const [fetched, setFetched] = useState(() => loaded.get(src) || "");

  useEffect(() => {
    if (!kept || loaded.has(src)) return;
    let cancel = false;
    api(`/api/photos/${src.slice(PREFIX.length)}`, { token })
      .then((payload) => {
        const data = (payload as unknown as { data?: string }).data || "";
        if (data) loaded.set(src, data);
        if (!cancel) setFetched(data);
      })
      .catch(() => undefined);
    return () => {
      cancel = true;
    };
  }, [kept, src, token]);

  const shown = kept ? fetched : src;
  return shown ? <img src={shown} alt={alt} /> : <span className="photo-wait" role="img" aria-label="Photo loading" />;
}
