export function serviceFromPath(file: string): string | undefined {
  const normalised = file.replace(/\\/g, "/");
  const match = normalised.match(/(?:^|\/)services\/([^/]+)\//);
  return match?.[1];
}

export function discoverServices(
  listed: string[],
  files: string[],
): string[] {
  const found = new Set(listed);
  for (const file of files) {
    const service = serviceFromPath(file);
    if (service !== undefined) {
      found.add(service);
    }
  }
  return [...found].sort();
}
