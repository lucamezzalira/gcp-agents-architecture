export type ArchRuleCard = {
  id: string;
  title: string;
  description: string;
  characteristic: string;
  penalty: number;
  platformCsi?: number;
};

export type MetricSignal = {
  id: string;
  description: string;
  characteristic: string;
  penalty: string;
};

export const ARCH_RULES: ArchRuleCard[] = [
  {
    id: "rule-1",
    title: "Transport stays off infrastructure",
    description:
      "Transport must not import the infrastructure folder, and must not import provider or storage clients (email-provider, firestore-, gcs-). Domain ports with those names stay allowed.",
    characteristic: "layering",
    penalty: 20,
  },
  {
    id: "rule-2",
    title: "Infrastructure may only use domain ports",
    description:
      "Infrastructure must not depend on domain except domain/ports/. Use cases live as files directly under domain/, so a new use case fails without a rule change.",
    characteristic: "layering",
    penalty: 20,
  },
  {
    id: "rule-3",
    title: "Only notification talks to the email provider",
    description:
      "No service outside notification may import or call the email provider. The penalty lands on the service that made the import.",
    characteristic: "boundary-integrity",
    penalty: 40,
    platformCsi: 40,
  },
  {
    id: "rule-4",
    title: "No service reads another service's store",
    description:
      "Checkout must not import notification stores. Each service has its own Firestore database.",
    characteristic: "boundary-integrity",
    penalty: 30,
    platformCsi: 30,
  },
  {
    id: "rule-5",
    title: "No service imports another service's internals",
    description:
      "Cross-service imports other than the provider (rule 3) and store reads (rule 4) fail here. The service that reached in is penalised, not the one that was reached.",
    characteristic: "boundary-integrity",
    penalty: 25,
    platformCsi: 25,
  },
  {
    id: "rule-6",
    title: "Domain must not depend on transport",
    description:
      "Domain code cannot import transport types or handlers. HTTP and Pub/Sub stay at the edge.",
    characteristic: "layering",
    penalty: 20,
  },
  {
    id: "rule-7",
    title: "Transport must not depend on another service's transport",
    description:
      "Checkout transport cannot import notification transport, and the reverse is also forbidden.",
    characteristic: "boundary-integrity",
    penalty: 25,
    platformCsi: 25,
  },
  {
    id: "rule-8",
    title: "Domain must not depend on infrastructure",
    description:
      "Domain, including domain/ports, must not import infrastructure. Ports are interfaces. Adapters live in infrastructure.",
    characteristic: "layering",
    penalty: 20,
  },
  {
    id: "rule-9",
    title: "Infrastructure must not depend on transport",
    description:
      "Adapters cannot import HTTP or Pub/Sub handlers. Wiring belongs in the application composition root.",
    characteristic: "layering",
    penalty: 20,
  },
];

export const RULE_COUNT = ARCH_RULES.length;

export const METRIC_SIGNALS: MetricSignal[] = [
  {
    id: "cycle",
    description: "Each circular dependency",
    characteristic: "coupling",
    penalty: "15",
  },
  {
    id: "orphan",
    description: "Each orphan module",
    characteristic: "coupling",
    penalty: "5",
  },
  {
    id: "unresolvable",
    description: "Each not-to-unresolvable violation",
    characteristic: "coupling",
    penalty: "10",
  },
  {
    id: "dep-on-test",
    description: "Each no-dep-on-test violation",
    characteristic: "coupling",
    penalty: "10",
  },
  {
    id: "efferent-growth",
    description:
      "Outgoing dependencies that leave the service, vs the prior run. Increase only. Afferent coupling is not scored.",
    characteristic: "coupling",
    penalty: "10 per extra edge",
  },
  {
    id: "internal-clone",
    description: "Internal clone count (first run) or growth vs prior",
    characteristic: "duplication",
    penalty: "8 per extra clone",
  },
  {
    id: "cross-service-clone",
    description: "Clones that span services (first run or growth)",
    characteristic: "cross-service-integrity",
    penalty: "10 per extra clone",
  },
  {
    id: "shared-clone",
    description: "Clones that span a service and code outside services/",
    characteristic: "cross-service-integrity",
    penalty: "8 per extra clone",
  },
];

export function scoringLine(rule: ArchRuleCard): string {
  const service = `Scores on ${rule.characteristic}. Penalty ${rule.penalty}.`;
  if (rule.platformCsi === undefined) {
    return service;
  }
  return `${service} Also ${rule.platformCsi} on platform cross-service-integrity.`;
}
