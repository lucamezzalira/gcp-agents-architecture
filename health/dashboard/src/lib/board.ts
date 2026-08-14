import type { CharacteristicRead, HealthRun } from "./types.js";
import {
  displayName,
  displayedCharacteristics,
  displayedOverall,
  easeOutCubic,
  hundredNote,
  improvementCopy,
  lerp,
  ringOffset,
  ruleSetVersionOf,
  scoreTone,
  selectRun,
  shortSha,
  toneColor,
} from "./view.js";

const RADIUS = 58;
const DURATION_MS = 520;

function escapeText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function characteristicHtml(item: CharacteristicRead): string {
  const tone = scoreTone(item.score);
  const recs = improvementCopy(item.score, item.recommendations);
  const note = hundredNote(item);
  const suppressed = (item.suppressedBy ?? []).length > 0;
  const recBlock =
    note !== undefined
      ? `<p class="${suppressed ? "suppressed-note" : "ok-note"}">${escapeText(note)}</p>`
      : `<div class="improve"><h3>How to improve</h3><ul>${recs
          .map((line) => `<li>${escapeText(line)}</li>`)
          .join("")}</ul></div>`;
  const signals =
    item.signalsUsed.length === 0
      ? ""
      : `<p class="signals">${escapeText(item.signalsUsed.join(" · "))}</p>`;
  return `<article class="panel card${suppressed ? " card-suppressed" : ""}">
    <header>
      <h2>${escapeText(displayName(item.id))}</h2>
      <div class="n ${tone}">${item.score}</div>
    </header>
    <div class="meter ${tone}"><span style="width: ${item.score}%"></span></div>
    <p>${escapeText(item.reasoning)}</p>
    ${recBlock}
    ${signals}
  </article>`;
}

function applyOverall(score: number): void {
  const rounded = Math.round(score);
  const tone = scoreTone(rounded);
  const color = toneColor(rounded);
  const panel = document.querySelector("[data-score-panel]");
  if (panel instanceof HTMLElement) {
    panel.classList.remove("ok", "mid", "drop");
    panel.classList.add(tone);
  }
  const value = document.querySelector("[data-overall]");
  if (value instanceof HTMLElement) {
    value.textContent = String(rounded);
    value.classList.remove("ok", "mid", "drop");
    value.classList.add(tone);
  }
  const ring = document.querySelector("[data-ring]");
  if (ring instanceof SVGCircleElement) {
    ring.style.stroke = color;
    ring.style.strokeDashoffset = String(ringOffset(score, RADIUS));
  }
  const overallMeta = document.querySelector("[data-overall-meta]");
  if (overallMeta) {
    overallMeta.textContent = `${rounded} / 100`;
  }
}

function currentService(): string | undefined {
  const value = new URLSearchParams(window.location.search).get("service");
  return value !== null && value.length > 0 ? value : undefined;
}

function serviceOverall(run: HealthRun, name: string): string {
  const found = run.services.find((item) => item.service === name);
  return found === undefined ? "n/a" : String(found.overall);
}

export function paintCopy(run: HealthRun, service?: string): void {
  const commit = document.querySelector("[data-commit]");
  if (commit) commit.textContent = shortSha(run.commitSha);
  const message = document.querySelector("[data-message]");
  if (message) message.textContent = run.commitMessage;
  const runId = document.querySelector("[data-run-id]");
  if (runId) runId.textContent = run.runId;
  const reasoner = document.querySelector("[data-reasoner]");
  if (reasoner) reasoner.textContent = run.reasoner ?? "unknown";
  const traceId = document.querySelector("[data-trace-id]");
  if (traceId) traceId.textContent = run.traceId ?? "none";
  const ruleSet = document.querySelector("[data-rule-set]");
  if (ruleSet) ruleSet.textContent = `v${ruleSetVersionOf(run)}`;
  const state = document.querySelector("[data-state]");
  if (state) state.textContent = run.state ?? "current";
  const caption = document.querySelector("[data-scope-caption]");
  if (caption) {
    caption.textContent =
      service === undefined
        ? "Platform overall · click a commit on the trend to compare"
        : `${service} overall · click platform to return`;
  }
  const checkoutOverall = document.querySelector("[data-checkout-overall]");
  if (checkoutOverall) checkoutOverall.textContent = serviceOverall(run, "checkout");
  const notificationOverall = document.querySelector(
    "[data-notification-overall]",
  );
  if (notificationOverall) {
    notificationOverall.textContent = serviceOverall(run, "notification");
  }

  document.querySelectorAll("[data-service]").forEach((node) => {
    const name = node.getAttribute("data-service") ?? "";
    const selected =
      name === "" ? service === undefined : name === service;
    node.classList.toggle("is-selected", selected);
  });

  const cards = document.querySelector("[data-cards]");
  if (cards instanceof HTMLElement) {
    cards.innerHTML = displayedCharacteristics(run, service)
      .map(characteristicHtml)
      .join("");
  }

  document.querySelectorAll("[data-run]").forEach((node) => {
    const id = node.getAttribute("data-run");
    const selected = id === run.runId;
    node.classList.toggle("is-selected", selected);
    node.setAttribute("aria-pressed", selected ? "true" : "false");
    const dot = node.querySelector(".dot");
    if (dot instanceof SVGCircleElement) {
      dot.setAttribute("r", selected ? "7" : "5");
    }
  });
}

export function mountBoard(runs: HealthRun[]): void {
  const params = new URLSearchParams(window.location.search);
  const initial = selectRun(
    runs,
    params.get("commit") ?? undefined,
    params.get("run") ?? undefined,
  );
  let service = currentService();
  if (
    service !== undefined &&
    initial?.services.every((item) => item.service !== service)
  ) {
    service = undefined;
  }
  let displayed =
    initial === undefined ? 100 : displayedOverall(initial, service);
  let currentRunId = initial?.runId;
  let raf = 0;

  const stopTween = (): void => {
    if (raf !== 0) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
  };

  const tweenOverall = (to: number): void => {
    stopTween();
    const from = displayed;
    if (from === to) {
      applyOverall(to);
      return;
    }
    const started = performance.now();
    const tick = (now: number): void => {
      const t = Math.min(1, (now - started) / DURATION_MS);
      displayed = lerp(from, to, easeOutCubic(t));
      applyOverall(displayed);
      if (t < 1) {
        raf = requestAnimationFrame(tick);
        return;
      }
      displayed = to;
      applyOverall(to);
      raf = 0;
    };
    raf = requestAnimationFrame(tick);
  };

  const writeUrl = (run: HealthRun, nextService: string | undefined): void => {
    const next = new URL(window.location.href);
    next.searchParams.set("commit", shortSha(run.commitSha));
    next.searchParams.set("run", run.runId);
    if (nextService === undefined) {
      next.searchParams.delete("service");
    } else {
      next.searchParams.set("service", nextService);
    }
    window.history.replaceState({}, "", next);
  };

  if (initial !== undefined) {
    paintCopy(initial, service);
    applyOverall(displayedOverall(initial, service));
  }

  const activateRun = (runId: string): void => {
    const run = selectRun(runs, undefined, runId);
    if (run === undefined || run.runId === currentRunId) {
      return;
    }
    currentRunId = run.runId;
    paintCopy(run, service);
    tweenOverall(displayedOverall(run, service));
    writeUrl(run, service);
  };

  const activateService = (nextService: string | undefined): void => {
    const run = selectRun(runs, undefined, currentRunId);
    if (run === undefined) {
      return;
    }
    service = nextService;
    paintCopy(run, service);
    tweenOverall(displayedOverall(run, service));
    writeUrl(run, service);
  };

  document.querySelectorAll("[data-run]").forEach((node) => {
    node.addEventListener("click", () => {
      const id = node.getAttribute("data-run");
      if (id !== null) {
        activateRun(id);
      }
    });
    node.addEventListener("keydown", (event) => {
      if (!(event instanceof KeyboardEvent)) {
        return;
      }
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      const id = node.getAttribute("data-run");
      if (id !== null) {
        activateRun(id);
      }
    });
  });

  document.querySelectorAll("[data-service]").forEach((node) => {
    node.addEventListener("click", (event) => {
      event.preventDefault();
      const name = node.getAttribute("data-service") ?? "";
      activateService(name.length === 0 ? undefined : name);
    });
  });
}
