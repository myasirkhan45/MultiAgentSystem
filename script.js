/* =========================================================================
   ResearchOS — Application Logic
   Pure vanilla JS. No frameworks, no build step.

   Sections:
     1. Configuration
     2. State
     3. DOM references
     4. Init
     5. View / navigation
     6. Research flow (start, API call, progress simulation)
     7. Agent workflow visualization
     8. Results rendering (overview, sources, report, critic)
     9. Minimal Markdown -> sanitized HTML renderer
     10. History (localStorage)
     11. Tabs / accordion
     12. Toasts
     13. Utilities
   ========================================================================= */

/* ---------------------------------------------------------------------- *
 * 1. Configuration — change the backend URL here, and only here.
 * ---------------------------------------------------------------------- */
const CONFIG = {
  API_URL: "http://127.0.0.1:8000/research",
  REQUEST_TIMEOUT_MS: 300000, // 5 minutes — research can take a while
  HISTORY_KEY: "researchos_history",
  HISTORY_LIMIT: 25,
};

/* ---------------------------------------------------------------------- *
 * 2. Application state
 * ---------------------------------------------------------------------- */
const state = {
  isResearching: false,
  currentTopic: "",
  currentResult: null,
  abortController: null,
  progressTimer: null,
};

/* Ordered list of pipeline stages. Kept as data so the progress simulator
   and the agent-node visualization both read from a single source of truth,
   and so a future WebSocket/SSE integration can drive the same structure. */
const STAGES = [
  { key: "search", label: "Search Agent", working: "Searching the web…", done: "Found relevant sources" },
  { key: "reader", label: "Reader Agent", working: "Reading relevant sources…", done: "Analyzed selected sources" },
  { key: "writer", label: "Writer Agent", working: "Preparing the report…", done: "Report drafted" },
  { key: "critic", label: "Critic Agent", working: "Evaluating research quality…", done: "Evaluation complete" },
];

/* ---------------------------------------------------------------------- *
 * 3. DOM references (queried once)
 * ---------------------------------------------------------------------- */
const els = {};

function cacheDom() {
  els.mobileMenuBtn = document.getElementById("mobileMenuBtn");
  els.mobileNav = document.getElementById("mobileNav");

  els.topicInput = document.getElementById("topicInput");
  els.charCount = document.getElementById("charCount");
  els.clearBtn = document.getElementById("clearBtn");
  els.startBtn = document.getElementById("startBtn");

  els.workflowTrack = document.getElementById("workflowTrack");

  els.progressCard = document.getElementById("progressCard");
  els.progressPercent = document.getElementById("progressPercent");
  els.progressBar = document.getElementById("progressBar");
  els.progressBarFill = document.getElementById("progressBarFill");
  els.progressSteps = document.getElementById("progressSteps");

  els.errorCard = document.getElementById("errorCard");
  els.errorMessage = document.getElementById("errorMessage");
  els.errorTechnical = document.getElementById("errorTechnical");
  els.retryBtn = document.getElementById("retryBtn");
  els.dismissErrorBtn = document.getElementById("dismissErrorBtn");

  els.emptyState = document.getElementById("emptyState");
  els.exampleChips = document.getElementById("exampleChips");

  els.resultsSection = document.getElementById("resultsSection");
  els.summaryTopic = document.getElementById("summaryTopic");
  els.summarySources = document.getElementById("summarySources");
  els.summaryStatus = document.getElementById("summaryStatus");
  els.summaryScore = document.getElementById("summaryScore");

  els.detailSearch = document.getElementById("detailSearch");
  els.detailReader = document.getElementById("detailReader");
  els.detailWriter = document.getElementById("detailWriter");
  els.detailCritic = document.getElementById("detailCritic");

  els.sourcesGrid = document.getElementById("sourcesGrid");

  els.reportContent = document.getElementById("reportContent");
  els.copyReportBtn = document.getElementById("copyReportBtn");
  els.downloadReportBtn = document.getElementById("downloadReportBtn");
  els.printReportBtn = document.getElementById("printReportBtn");

  els.criticScoreRing = document.getElementById("criticScoreRing");
  els.criticScoreValue = document.getElementById("criticScoreValue");
  els.criticStrengths = document.getElementById("criticStrengths");
  els.criticImprovements = document.getElementById("criticImprovements");
  els.criticVerdict = document.getElementById("criticVerdict");

  els.historyList = document.getElementById("historyList");
  els.historyEmptyNote = document.getElementById("historyEmptyNote");
  els.clearHistoryBtn = document.getElementById("clearHistoryBtn");

  els.toastContainer = document.getElementById("toastContainer");

  els.systemStatusDot = document.getElementById("systemStatusDot");
  els.systemStatusText = document.getElementById("systemStatusText");
}

/* ---------------------------------------------------------------------- *
 * 4. Init
 * ---------------------------------------------------------------------- */
function initApp() {
  cacheDom();
  bindNavigation();
  bindResearchInput();
  bindExampleChips();
  bindErrorActions();
  bindReportActions();
  bindAccordion();
  bindTabs();
  bindHistoryActions();

  loadHistory();
  refreshIcons();
}

function refreshIcons() {
  // lucide.min.js exposes a global `lucide` object with createIcons().
  if (window.lucide && typeof window.lucide.createIcons === "function") {
    window.lucide.createIcons();
  }
}

document.addEventListener("DOMContentLoaded", initApp);

/* ---------------------------------------------------------------------- *
 * 5. View / navigation
 * ---------------------------------------------------------------------- */
function bindNavigation() {
  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => switchView(btn.dataset.view));
  });

  els.mobileMenuBtn.addEventListener("click", () => {
    const isOpen = els.mobileNav.hasAttribute("data-open");
    if (isOpen) {
      els.mobileNav.removeAttribute("data-open");
      els.mobileNav.hidden = true;
      els.mobileMenuBtn.setAttribute("aria-expanded", "false");
    } else {
      els.mobileNav.setAttribute("data-open", "");
      els.mobileNav.hidden = false;
      els.mobileMenuBtn.setAttribute("aria-expanded", "true");
    }
  });
}

function switchView(viewName) {
  document.querySelectorAll("[data-view-panel]").forEach((panel) => {
    panel.hidden = panel.id !== `view-${viewName}`;
  });

  document.querySelectorAll("[data-view]").forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.view === viewName);
  });

  // Close mobile drawer after navigating
  els.mobileNav.hidden = true;
  els.mobileNav.removeAttribute("data-open");
  els.mobileMenuBtn.setAttribute("aria-expanded", "false");

  if (viewName === "history") renderHistoryList();
}

/* ---------------------------------------------------------------------- *
 * 6. Research flow
 * ---------------------------------------------------------------------- */
function bindResearchInput() {
  els.topicInput.addEventListener("input", () => {
    els.charCount.textContent = `${els.topicInput.value.length} / 500`;
  });

  els.clearBtn.addEventListener("click", () => {
    els.topicInput.value = "";
    els.charCount.textContent = "0 / 500";
    els.topicInput.focus();
  });

  els.startBtn.addEventListener("click", startResearch);

  // Ctrl/Cmd + Enter submits
  els.topicInput.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") startResearch();
  });
}

function bindExampleChips() {
  els.exampleChips.querySelectorAll(".example-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      els.topicInput.value = chip.textContent.trim();
      els.charCount.textContent = `${els.topicInput.value.length} / 500`;
      els.topicInput.focus();
    });
  });
}

function bindErrorActions() {
  els.retryBtn.addEventListener("click", () => startResearch());
  els.dismissErrorBtn.addEventListener("click", () => {
    els.errorCard.hidden = true;
    els.emptyState.hidden = false;
  });
}

async function startResearch() {
  const topic = els.topicInput.value.trim();

  if (!topic) {
    showToast("Enter a topic before starting research.", "error");
    els.topicInput.focus();
    return;
  }

  if (state.isResearching) return; // prevent duplicate submissions

  state.isResearching = true;
  state.currentTopic = topic;

  setStartButtonLoading(true);
  els.errorCard.hidden = true;
  els.emptyState.hidden = true;
  els.resultsSection.hidden = true;
  els.progressCard.hidden = false;

  resetWorkflowVisual();
  resetProgressSteps();

  // Begin the visual stage simulation (search -> reader -> writer -> critic)
  // while the real request is in flight. This gives the user meaningful
  // feedback even though the backend responds once, at the end.
  runProgressSimulation();

  try {
    const result = await callResearchAPI(topic);
    completeAllStages();
    state.currentResult = result;
    saveToHistory(topic, "completed", result);
    showResults(result);
  } catch (err) {
    markCurrentStageAsError();
    showError(err);
    saveToHistory(topic, "error", null);
  } finally {
    state.isResearching = false;
    setStartButtonLoading(false);
    stopProgressSimulation();
  }
}

function setStartButtonLoading(isLoading) {
  els.startBtn.disabled = isLoading;
  els.startBtn.classList.toggle("is-loading", isLoading);
  const spinner = els.startBtn.querySelector(".btn__spinner");
  if (spinner) spinner.hidden = !isLoading;
}

/**
 * Calls the research backend. Structured so real streaming (WebSocket/SSE)
 * can later replace the simulated progress without touching this contract:
 * this function's only job is "send the topic, return the parsed JSON".
 */
async function callResearchAPI(topic) {
  state.abortController = new AbortController();
  const timeout = setTimeout(() => state.abortController.abort(), CONFIG.REQUEST_TIMEOUT_MS);

  let response;
  try {
    response = await fetch(CONFIG.API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ topic }),
      signal: state.abortController.signal,
    });
  } catch (networkErr) {
    clearTimeout(timeout);
    if (networkErr.name === "AbortError") {
      throw new Error("The request took too long and was cancelled.");
    }
    throw new Error(
      "Could not reach the research backend. Is it running at " + CONFIG.API_URL + "?"
    );
  }
  clearTimeout(timeout);

  if (!response.ok) {
    let detail = "";
    try {
      const errJson = await response.json();
      detail = errJson.message || errJson.detail || JSON.stringify(errJson);
    } catch {
      detail = await response.text().catch(() => "");
    }
    const err = new Error(`Backend returned an error (HTTP ${response.status}).`);
    err.technical = detail || `HTTP ${response.status} ${response.statusText}`;
    throw err;
  }

  try {
    return await response.json();
  } catch {
    throw new Error("The backend response was not valid JSON.");
  }
}

/* ---------------------------------------------------------------------- *
 * 7. Agent workflow visualization + progress simulation
 * ---------------------------------------------------------------------- */
function resetWorkflowVisual() {
  document.querySelectorAll(".agent-node").forEach((node) => {
    updateAgentStatus(node.dataset.agent, "idle");
  });
  document.querySelectorAll(".workflow__connector").forEach((c) => c.classList.remove("is-active"));
}

/**
 * Updates a single agent node's visual state.
 * @param {string} agentKey - one of "search" | "reader" | "writer" | "critic"
 * @param {string} newState - one of "idle" | "processing" | "completed" | "error"
 */
function updateAgentStatus(agentKey, newState) {
  const node = document.querySelector(`.agent-node[data-agent="${agentKey}"]`);
  if (!node) return;
  node.dataset.state = newState;

  const stateLabel = node.querySelector(".agent-node__state");
  const labels = { idle: "Idle", processing: "Processing…", completed: "Completed", error: "Error" };
  stateLabel.textContent = labels[newState] || newState;
}

function resetProgressSteps() {
  els.progressBarFill.style.width = "0%";
  els.progressBar.setAttribute("aria-valuenow", "0");
  els.progressPercent.textContent = "0%";

  STAGES.forEach((stage) => {
    const li = els.progressSteps.querySelector(`[data-step="${stage.key}"]`);
    li.dataset.state = "pending";
    li.querySelector(".progress-step__detail").textContent = "Waiting…";
    const icon = li.querySelector(".progress-step__icon");
    icon.innerHTML = '<i data-lucide="circle"></i>';
  });
  refreshIcons();
}

/**
 * Frontend-only stage simulator. This exists because the current backend
 * contract is request/response (one call, one final payload) rather than
 * streaming. It advances one stage at a time on a timer while the real
 * fetch() is in flight, then `completeAllStages()` finalizes everything
 * once the actual response arrives.
 *
 * To wire up real backend progress later (WebSocket/SSE), replace the
 * body of this function with event listeners that call
 * `setStageActive(key)` / `setStageDone(key)` as events arrive — the rest
 * of the app already reacts to those two functions.
 */
function runProgressSimulation() {
  let index = 0;
  const stepDurationMs = 2200;

  setStageActive(STAGES[0].key);

  state.progressTimer = setInterval(() => {
    if (!state.isResearching) return; // real response already finished

    setStageDone(STAGES[index].key);
    index += 1;

    if (index < STAGES.length) {
      setStageActive(STAGES[index].key);
    } else {
      // All simulated stages shown; hold at 95% until the real response lands.
      clearInterval(state.progressTimer);
      setProgressPercent(95);
    }
  }, stepDurationMs);
}

function stopProgressSimulation() {
  if (state.progressTimer) {
    clearInterval(state.progressTimer);
    state.progressTimer = null;
  }
}

function setStageActive(key) {
  const stage = STAGES.find((s) => s.key === key);
  if (!stage) return;

  updateAgentStatus(key, "processing");

  const connectorBefore = getConnectorBefore(key);
  if (connectorBefore) connectorBefore.classList.add("is-active");

  const li = els.progressSteps.querySelector(`[data-step="${key}"]`);
  li.dataset.state = "active";
  li.querySelector(".progress-step__detail").textContent = stage.working;
  li.querySelector(".progress-step__icon").innerHTML = '<i data-lucide="loader-2" class="spin-icon"></i>';
  refreshIcons();

  const stageIndex = STAGES.findIndex((s) => s.key === key);
  setProgressPercent(Math.round((stageIndex / STAGES.length) * 100) + 5);
}

function setStageDone(key) {
  const stage = STAGES.find((s) => s.key === key);
  if (!stage) return;

  updateAgentStatus(key, "completed");

  const li = els.progressSteps.querySelector(`[data-step="${key}"]`);
  li.dataset.state = "done";
  li.querySelector(".progress-step__detail").textContent = stage.done;
  li.querySelector(".progress-step__icon").innerHTML = '<i data-lucide="check-circle-2"></i>';
  refreshIcons();

  const stageIndex = STAGES.findIndex((s) => s.key === key);
  setProgressPercent(Math.round(((stageIndex + 1) / STAGES.length) * 100));
}

function completeAllStages() {
  STAGES.forEach((s) => setStageDone(s.key));
  document.querySelectorAll(".workflow__connector").forEach((c) => c.classList.add("is-active"));
  setProgressPercent(100);
}

function markCurrentStageAsError() {
  const activeLi = els.progressSteps.querySelector('[data-state="active"]');
  if (activeLi) {
    const key = activeLi.dataset.step;
    updateAgentStatus(key, "error");
    activeLi.dataset.state = "error";
    activeLi.querySelector(".progress-step__detail").textContent = "Something went wrong.";
    activeLi.querySelector(".progress-step__icon").innerHTML = '<i data-lucide="x-circle"></i>';
    refreshIcons();
  }
}

function setProgressPercent(pct) {
  const clamped = Math.max(0, Math.min(100, pct));
  els.progressBarFill.style.width = `${clamped}%`;
  els.progressBar.setAttribute("aria-valuenow", String(clamped));
  els.progressPercent.textContent = `${clamped}%`;
}

function getConnectorBefore(agentKey) {
  const node = document.querySelector(`.agent-node[data-agent="${agentKey}"]`);
  if (!node) return null;
  const prev = node.previousElementSibling;
  return prev && prev.classList.contains("workflow__connector") ? prev : null;
}

/* ---------------------------------------------------------------------- *
 * 8. Results rendering
 * ---------------------------------------------------------------------- */
function showResults(result) {
  els.progressCard.hidden = true;
  els.resultsSection.hidden = false;

  renderOverview(result);
  renderSources(result);
  renderReport(result);
  renderCritic(result);

  // Always return to the Overview tab for a fresh result
  activateTab("overview");
}

function na(value) {
  if (value === undefined || value === null || value === "") return "Not available";
  return value;
}

function renderOverview(result) {
  els.summaryTopic.textContent = na(result.topic || state.currentTopic);

  const sources = extractSources(result);
  els.summarySources.textContent = sources.length > 0 ? String(sources.length) : na(undefined);

  els.summaryStatus.textContent = result.report ? "Completed ✓" : na(undefined);

  const score = extractCriticScore(result);
  els.summaryScore.textContent = score !== null ? `${score} / 10` : na(undefined);

  // Raw agent detail panels — shown as-is (stringified) for debugging/demo.
  els.detailSearch.textContent = stringifyDetail(result.search_results);
  els.detailReader.textContent = stringifyDetail(result.scraped_content);
  els.detailWriter.textContent = stringifyDetail(result.report);
  els.detailCritic.textContent = stringifyDetail(result.feedback);
}

function stringifyDetail(value) {
  if (value === undefined || value === null || value === "") return "Not available";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** Normalizes whatever shape `search_results` comes in into an array of
 *  { title, url, snippet, domain } objects. Backend response shapes vary,
 *  so this stays defensive rather than assuming one exact structure. */
function extractSources(result) {
  const raw = result.sources ?? result.search_results;
  if (!raw) return [];

  let list = raw;
  if (typeof raw === "string") {
    try {
      list = JSON.parse(raw);
    } catch {
      return []; // plain-text search results with no structure we can list
    }
  }
  if (!Array.isArray(list)) return [];

  return list.map((item) => {
    const url = item.url || item.link || "";
    let domain = item.domain || "";
    if (!domain && url) {
      try {
        domain = new URL(url).hostname.replace(/^www\./, "");
      } catch {
        domain = "";
      }
    }
    return {
      title: item.title || item.name || domain || "Untitled source",
      url,
      snippet: item.snippet || item.summary || item.description || "",
      domain,
    };
  });
}

function renderSources(result) {
  const sources = extractSources(result);
  els.sourcesGrid.innerHTML = "";

  if (sources.length === 0) {
    els.sourcesGrid.innerHTML = `<p class="muted">Not available</p>`;
    return;
  }

  sources.forEach((src) => {
    const card = document.createElement("article");
    card.className = "source-card";

    const title = document.createElement("h3");
    title.className = "source-card__title";
    title.textContent = src.title;
    card.appendChild(title);

    if (src.domain) {
      const domain = document.createElement("span");
      domain.className = "source-card__domain";
      domain.textContent = src.domain;
      card.appendChild(domain);
    }

    if (src.snippet) {
      const snippet = document.createElement("p");
      snippet.className = "source-card__snippet";
      snippet.textContent = src.snippet;
      card.appendChild(snippet);
    }

    if (src.url) {
      const link = document.createElement("a");
      link.className = "source-card__link";
      link.href = src.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.innerHTML = `Open Source <i data-lucide="external-link"></i>`;
      card.appendChild(link);
    }

    els.sourcesGrid.appendChild(card);
  });

  refreshIcons();
}

function renderReport(result) {
  const reportText = result.report;
  if (!reportText) {
    els.reportContent.innerHTML = `<p class="muted">Not available</p>`;
    return;
  }
  els.reportContent.innerHTML = markdownToSafeHtml(String(reportText));
}

function bindReportActions() {
  els.copyReportBtn.addEventListener("click", async () => {
    const text = state.currentResult?.report;
    if (!text) {
      showToast("No report to copy yet.", "error");
      return;
    }
    try {
      await navigator.clipboard.writeText(String(text));
      showToast("Report copied to clipboard.", "success");
    } catch {
      showToast("Couldn't copy automatically — please select and copy manually.", "error");
    }
  });

  els.downloadReportBtn.addEventListener("click", () => {
    const text = state.currentResult?.report;
    if (!text) {
      showToast("No report to download yet.", "error");
      return;
    }
    const blob = new Blob([String(text)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeTopic = (state.currentTopic || "research-report").replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    a.href = url;
    a.download = `${safeTopic || "research-report"}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast("Report downloaded.", "success");
  });

  els.printReportBtn.addEventListener("click", () => {
    if (!state.currentResult?.report) {
      showToast("No report to print yet.", "error");
      return;
    }
    window.print();
  });
}

/** Extracts a numeric 0–10 score from whatever shape `feedback` comes in. */
function extractCriticScore(result) {
  const fb = result.feedback;
  if (fb === undefined || fb === null) return null;

  if (typeof fb === "number") return roundScore(fb);

  if (typeof fb === "object") {
    const candidate = fb.score ?? fb.rating ?? fb.critic_score;
    if (typeof candidate === "number") return roundScore(candidate);
  }

  if (typeof fb === "string") {
    const match = fb.match(/(\d+(\.\d+)?)\s*\/\s*10/);
    if (match) return roundScore(parseFloat(match[1]));
  }

  return null;
}

function roundScore(n) {
  return Math.round(n * 10) / 10;
}

function renderCritic(result) {
  const fb = result.feedback;
  const score = extractCriticScore(result);

  if (score !== null) {
    els.criticScoreValue.textContent = `${score}`;
    els.criticScoreRing.style.setProperty("--score-pct", String((score / 10) * 100));
  } else {
    els.criticScoreValue.textContent = "—";
    els.criticScoreRing.style.setProperty("--score-pct", "0");
  }

  const strengths = extractListField(fb, ["strengths", "pros", "good"]);
  const improvements = extractListField(fb, ["improvements", "weaknesses", "areas_to_improve", "cons"]);
  const verdict = extractVerdict(fb);

  fillList(els.criticStrengths, strengths);
  fillList(els.criticImprovements, improvements);
  els.criticVerdict.textContent = verdict || "Not available";
}

function extractListField(fb, keys) {
  if (!fb || typeof fb !== "object") return [];
  for (const key of keys) {
    if (Array.isArray(fb[key])) return fb[key].map(String);
  }
  return [];
}

function extractVerdict(fb) {
  if (!fb) return null;
  if (typeof fb === "string") return fb;
  if (typeof fb === "object") {
    return fb.verdict || fb.summary || fb.comment || null;
  }
  return null;
}

function fillList(ulEl, items) {
  ulEl.innerHTML = "";
  if (!items || items.length === 0) {
    ulEl.innerHTML = `<li class="muted">Not available</li>`;
    return;
  }
  items.forEach((item) => {
    const li = document.createElement("li");
    li.textContent = item;
    ulEl.appendChild(li);
  });
}

/* ---------------------------------------------------------------------- *
 * 9. Minimal Markdown -> sanitized HTML
 *    Deliberately small: headings, bold/italic, links, lists, blockquotes,
 *    inline code, and simple pipe tables. Escapes all raw text first so no
 *    backend-supplied HTML/script can execute.
 * ---------------------------------------------------------------------- */
function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

function markdownToSafeHtml(markdown) {
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const htmlParts = [];
  let i = 0;
  let inList = null; // "ul" | "ol" | null

  const closeList = () => {
    if (inList) {
      htmlParts.push(`</${inList}>`);
      inList = null;
    }
  };

  while (i < lines.length) {
    const line = lines[i];

    // Table block: a header row followed by a separator row of ---|---
    if (/^\s*\|.*\|\s*$/.test(line) && lines[i + 1] && /^\s*\|?[\s:-]+\|[\s:|-]+\s*$/.test(lines[i + 1])) {
      closeList();
      const headerCells = splitTableRow(line);
      i += 2;
      const bodyRows = [];
      while (i < lines.length && /^\s*\|.*\|\s*$/.test(lines[i])) {
        bodyRows.push(splitTableRow(lines[i]));
        i += 1;
      }
      htmlParts.push(renderTable(headerCells, bodyRows));
      continue;
    }

    // Headings
    const headingMatch = line.match(/^(#{1,3})\s+(.*)$/);
    if (headingMatch) {
      closeList();
      const level = headingMatch[1].length;
      htmlParts.push(`<h${level}>${inlineMarkdown(headingMatch[2])}</h${level}>`);
      i += 1;
      continue;
    }

    // Blockquote
    if (/^>\s?/.test(line)) {
      closeList();
      const quoteLines = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i += 1;
      }
      htmlParts.push(`<blockquote>${inlineMarkdown(quoteLines.join(" "))}</blockquote>`);
      continue;
    }

    // Unordered list
    if (/^\s*[-*]\s+/.test(line)) {
      if (inList !== "ul") { closeList(); htmlParts.push("<ul>"); inList = "ul"; }
      htmlParts.push(`<li>${inlineMarkdown(line.replace(/^\s*[-*]\s+/, ""))}</li>`);
      i += 1;
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s+/.test(line)) {
      if (inList !== "ol") { closeList(); htmlParts.push("<ol>"); inList = "ol"; }
      htmlParts.push(`<li>${inlineMarkdown(line.replace(/^\s*\d+\.\s+/, ""))}</li>`);
      i += 1;
      continue;
    }

    // Blank line
    if (line.trim() === "") {
      closeList();
      i += 1;
      continue;
    }

    // Paragraph — collect consecutive non-blank plain lines
    closeList();
    const paraLines = [line];
    i += 1;
    while (i < lines.length && lines[i].trim() !== "" && !/^(#{1,3})\s+/.test(lines[i]) && !/^\s*[-*\d]/.test(lines[i]) && !/^>\s?/.test(lines[i])) {
      paraLines.push(lines[i]);
      i += 1;
    }
    htmlParts.push(`<p>${inlineMarkdown(paraLines.join(" "))}</p>`);
  }

  closeList();
  return htmlParts.join("\n");
}

function splitTableRow(line) {
  return line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
}

function renderTable(headerCells, bodyRows) {
  const thead = `<thead><tr>${headerCells.map((c) => `<th>${inlineMarkdown(c)}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${bodyRows
    .map((row) => `<tr>${row.map((c) => `<td>${inlineMarkdown(c)}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}

/** Handles inline formatting within a single logical line: bold, italic,
 *  inline code, and links. Escapes the raw text first — every literal
 *  character the backend sent is neutralized before any markup is added. */
function inlineMarkdown(text) {
  let escaped = escapeHtml(text);

  // Inline code `code`
  escaped = escaped.replace(/`([^`]+)`/g, (_, code) => `<code>${code}</code>`);

  // Links [label](url) — only allow http(s) targets
  escaped = escaped.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_, label, url) => {
    return `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
  });

  // Bold **text**
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");

  // Italic *text* (after bold, so ** isn't partially matched)
  escaped = escaped.replace(/\*([^*]+)\*/g, "<em>$1</em>");

  return escaped;
}

/* ---------------------------------------------------------------------- *
 * 10. History (localStorage)
 * ---------------------------------------------------------------------- */
function loadHistory() {
  renderHistoryList();
}

function readHistoryStore() {
  try {
    const raw = localStorage.getItem(CONFIG.HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeHistoryStore(items) {
  try {
    localStorage.setItem(CONFIG.HISTORY_KEY, JSON.stringify(items));
  } catch {
    showToast("Could not save to history (storage unavailable).", "error");
  }
}

function saveToHistory(topic, status, result) {
  const items = readHistoryStore();
  items.unshift({
    id: `${Date.now()}`,
    topic,
    status, // "completed" | "error"
    timestamp: new Date().toISOString(),
    result: status === "completed" ? result : null,
  });
  writeHistoryStore(items.slice(0, CONFIG.HISTORY_LIMIT));
}

function renderHistoryList() {
  const items = readHistoryStore();
  els.historyList.innerHTML = "";

  if (items.length === 0) {
    els.historyEmptyNote.hidden = false;
    return;
  }
  els.historyEmptyNote.hidden = true;

  items.forEach((item) => {
    const li = document.createElement("li");
    li.className = "history-item";
    li.setAttribute("role", "button");
    li.tabIndex = 0;

    const date = new Date(item.timestamp);
    const dateLabel = isNaN(date) ? "" : date.toLocaleString(undefined, {
      month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit",
    });

    li.innerHTML = `
      <div class="history-item__main">
        <span class="history-item__topic">${escapeHtml(item.topic)}</span>
        <span class="history-item__date">${escapeHtml(dateLabel)}</span>
      </div>
      <span class="history-item__status status-${item.status}">
        ${item.status === "completed" ? "Completed" : "Failed"}
      </span>
    `;

    const openHistoryItem = () => {
      if (item.status === "completed" && item.result) {
        state.currentTopic = item.topic;
        state.currentResult = item.result;
        switchView("research");
        els.emptyState.hidden = true;
        els.errorCard.hidden = true;
        els.progressCard.hidden = true;
        showResults(item.result);
      } else {
        showToast("No saved data for this entry — only completed runs can be restored.", "error");
      }
    };

    li.addEventListener("click", openHistoryItem);
    li.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openHistoryItem(); }
    });

    els.historyList.appendChild(li);
  });
}

function bindHistoryActions() {
  els.clearHistoryBtn.addEventListener("click", () => {
    writeHistoryStore([]);
    renderHistoryList();
    showToast("History cleared.", "success");
  });
}

/* ---------------------------------------------------------------------- *
 * 11. Tabs / accordion
 * ---------------------------------------------------------------------- */
function bindTabs() {
  document.querySelectorAll(".tab").forEach((tabBtn) => {
    tabBtn.addEventListener("click", () => activateTab(tabBtn.dataset.tab));
  });
}

function activateTab(tabName) {
  document.querySelectorAll(".tab").forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });
  document.querySelectorAll(".tab-panel").forEach((panel) => {
    const isActive = panel.dataset.panel === tabName;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });
}

function bindAccordion() {
  document.querySelectorAll(".accordion-item__trigger").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const expanded = trigger.getAttribute("aria-expanded") === "true";
      trigger.setAttribute("aria-expanded", String(!expanded));
      const panel = trigger.nextElementSibling;
      panel.hidden = expanded;
    });
  });
}

/* ---------------------------------------------------------------------- *
 * 12. Errors & toasts
 * ---------------------------------------------------------------------- */
function showError(err) {
  els.progressCard.hidden = true;
  els.errorCard.hidden = false;
  els.errorMessage.textContent = err.message || "Unable to complete the research request.";
  els.errorTechnical.textContent = err.technical || err.stack || "No additional details available.";
}

function resetResearch() {
  state.currentResult = null;
  state.currentTopic = "";
  els.resultsSection.hidden = true;
  els.errorCard.hidden = true;
  els.progressCard.hidden = true;
  els.emptyState.hidden = false;
  resetWorkflowVisual();
}

function showToast(message, type = "success") {
  const toast = document.createElement("div");
  toast.className = `toast toast--${type}`;
  const icon = type === "success" ? "check-circle-2" : "alert-circle";
  toast.innerHTML = `<i data-lucide="${icon}"></i><span>${escapeHtml(message)}</span>`;
  els.toastContainer.appendChild(toast);
  refreshIcons();

  setTimeout(() => {
    toast.style.transition = "opacity 200ms ease";
    toast.style.opacity = "0";
    setTimeout(() => toast.remove(), 220);
  }, 3200);
}

/* ---------------------------------------------------------------------- *
 * 13. Small CSS hook injected via JS for the spinning loader icon
 *     (kept here instead of style.css since it's tied to a JS-inserted node)
 * ---------------------------------------------------------------------- */
(function injectSpinIconStyle() {
  const style = document.createElement("style");
  style.textContent = `
    .spin-icon { animation: spin 0.9s linear infinite; }
    @media (prefers-reduced-motion: reduce) { .spin-icon { animation: none; } }
  `;
  document.head.appendChild(style);
})();
