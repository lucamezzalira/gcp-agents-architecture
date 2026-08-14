/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: "no-circular",
      comment: "Cycles are the clearest structural failure.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      comment: "Production code nothing reaches.",
      severity: "warn",
      from: {
        orphan: true,
        pathNot: [
          "\\.d\\.ts$",
          "\\.(config|test|spec)\\.(js|ts)$",
          "(^|/)\\.[^/]+\\.(js|ts)$",
        ],
      },
      to: {},
    },
    {
      name: "not-to-unresolvable",
      severity: "error",
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: "no-dep-on-test",
      comment: "Production code must not reach test helpers.",
      severity: "error",
      from: { pathNot: "\\.(test|spec)\\.ts$" },
      to: { path: "\\.(test|spec)\\.ts$" },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    includeOnly: "^services/[^/]+/src",
    doNotFollow: { path: "node_modules" },
    enhancedResolveOptions: { extensions: [".ts", ".js"] },
    metrics: true,
    reporterOptions: { text: { highlightFocused: true } },
  },
};
