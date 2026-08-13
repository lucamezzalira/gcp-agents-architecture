export function pathMatchesGlob(path: string, glob: string): boolean {
  if (path === glob) {
    return true;
  }
  if (glob.endsWith("/**")) {
    const prefix = glob.slice(0, -3);
    return path === prefix || path.startsWith(`${prefix}/`);
  }
  const escaped = glob
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, ".*")
    .replace(/\*/g, "[^/]*");
  return new RegExp(`^${escaped}$`).test(path);
}

export function signalTouchesPath(signal: string, path: string): boolean {
  return signal.includes(path);
}
