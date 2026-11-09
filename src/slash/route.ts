import { useEffect, useState } from "react";

export function useHash() {
  const [hash, setHash] = useState(() => window.location.hash || "#/");
  useEffect(() => {
    const onChange = () => setHash(window.location.hash || "#/");
    window.addEventListener("hashchange", onChange);
    return () => window.removeEventListener("hashchange", onChange);
  }, []);
  const parts = hash.replace(/^#\/?/, "").split("/").filter(Boolean);
  return { hash, parts };
}

export function go(path: string) {
  const next = path.startsWith("#") ? path.slice(1) : path;
  window.location.hash = next.startsWith("/") ? next : `/${next}`;
}
