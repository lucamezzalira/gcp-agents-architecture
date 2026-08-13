import type { CharacteristicRead, HealthRun } from "./types.js";
import {
  displayName,
  easeOutCubic,
  improvementCopy,
  lerp,
  ringOffset,
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
  const recBlock =
    recs.length === 0
      ? `<p class="ok-note">At 100. No changes needed.</p>`
      : `<div class="improve"><h3>How to improve</h3><ul>${recs
          .map((line) => `<li>${escapeText(line)}</li>`)
          .join("")}</ul></div>`;
  const signals =
    item.signalsUsed.length === 0
      ? ""
      : `<p class="signals">${escapeText(item.signalsUsed.join(" · "))}</p>`;
  return `<article class="panel card">
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

export function paintCopy(run: HealthRun): void {
  const commit = document.querySelector("[data-commit]");
  if (commit) commit.textContent = shortSha(run.commitSha);
  const message = document.querySelector("[data-message]");
  if (message) message.textContent = run.commitMessage;
  const runId = document.querySelector("[data-run-id]");
  if (runId) runId.textContent = run.runId;

  const cards = document.querySelector("[data-cards]");
  if (cards instanceof HTMLElement) {
    cards.innerHTML = run.characteristics.map(characteristicHtml).join("");
  }

  document.querySelectorAll("[data-run]").forEach((node) => {
    const id = node.getAttribute("data-run");
    const selected = id === run.commitSha;
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
  const initial = selectRun(runs, params.get("commit") ?? undefined);
  let displayed = initial?.overall ?? 100;
  let currentSha = initial?.commitSha;
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

  if (initial !== undefined) {
    paintCopy(initial);
    applyOverall(initial.overall);
  }

  const activate = (sha: string): void => {
    const run = selectRun(runs, sha);
    if (run === undefined || run.commitSha === currentSha) {
      return;
    }
    currentSha = run.commitSha;
    paintCopy(run);
    tweenOverall(run.overall);
    const next = new URL(window.location.href);
    next.searchParams.set("commit", shortSha(run.commitSha));
    window.history.replaceState({}, "", next);
  };

  document.querySelectorAll("[data-run]").forEach((node) => {
    node.addEventListener("click", () => {
      const sha = node.getAttribute("data-run");
      if (sha !== null) {
        activate(sha);
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
      const sha = node.getAttribute("data-run");
      if (sha !== null) {
        activate(sha);
      }
    });
  });
}
