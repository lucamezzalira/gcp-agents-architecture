import { serviceFromPath } from "./paths.js";

export type CloneClassification = "internal" | "cross-service" | "shared";

export type ClassifiedClone = {
  classification: CloneClassification;
  services: string[];
};

export function classifyClone(files: string[]): ClassifiedClone {
  const services = [
    ...new Set(
      files
        .map((file) => serviceFromPath(file))
        .filter((item): item is string => item !== undefined),
    ),
  ].sort();
  const hasOutside = files.some((file) => serviceFromPath(file) === undefined);

  if (services.length >= 2) {
    return { classification: "cross-service", services };
  }
  if (services.length === 1 && hasOutside) {
    return { classification: "shared", services };
  }
  if (services.length === 1) {
    return { classification: "internal", services };
  }
  return { classification: "shared", services: [] };
}
