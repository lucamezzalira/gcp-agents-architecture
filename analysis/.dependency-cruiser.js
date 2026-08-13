/** @type {import('dependency-cruiser').IConfiguration} */
export default {
  forbidden: [
    {
      name: "no-circular",
      comment: "Cycles feed the coupling score.",
      severity: "warn",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    includeOnly: "^services",
    doNotFollow: {
      path: "node_modules",
    },
    enhancedResolveOptions: {
      extensions: [".ts", ".js"],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
