/**
 * Harper reads a wasm file URL with `URL.pathname`.
 * On Windows that pathname is `/C:/...`, and Node then opens `C:\C:\...`.
 */
export function windowsPathFromFileUrlPathname(pathname: string): string | null {
  const match = /^\/([A-Za-z]:\/.*)$/.exec(pathname);
  if (!match) return null;
  return match[1].replaceAll('/', '\\');
}
