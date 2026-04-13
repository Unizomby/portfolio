/**
 * app.js — Main application controller
 * ProcessWorth — Process Improvement ROI Calculator
 */

const App = (() => {

  // ─── STATE ──────────────────────────────────────────────────────────────────

  let state = Storage.getDefaults();
  let activePhase = '1';
  let activeScenario = 'expected'; // 'conservative' | 'expected' | 'aggressive'
  let simResult = null;
  let processState = {
    activeView: 'current',   // 'current' | 'future'
    currentNodes: [],
    futureNodes: [],
    currentConnections: [],
    futureConnections: [],
    selectedNodeId: null,
    connectMode: false,
    connectSourceId: null,
    dragging: null            // { nodeId, startX, startY, origX, origY }
  };
  let nodeIdCounter = 1;

  // ─── UTILITIES ──────────────────────────────────────────────────────────────

  const $ = id => document.getElementById(id);
  const num = id => parseFloat($$(id) || 0);

  function $$(id) {
    const el = $(id);
    return el ? el.value : null;
  }

  function setVal(id, v) {
    const el = $(id);
    if (!el) return;
    if (el.tagName === 'TEXTAREA') el.value = v != null ? v : '';
    else el.value = v != null ? v : '';
  }

  function fmtCurrency(n) {
    if (n == null || isNaN(n)) return '—';
    const abs = Math.abs(n);
    const neg = n < 0 ? '-' : '';
    if (abs >= 1e6) return neg + '$' + (abs / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return neg + '$' + (abs / 1e3).toFixed(1) + 'K';
    return neg + '$' + abs.toFixed(0);
  }

  function fmtPct(n) {
    if (n == null || isNaN(n)) return '—';
    return (n * 100).toFixed(1) + '%';
  }

  function fmtHours(n) {
    if (n == null || isNaN(n)) return '—';
    return n.toLocaleString(undefined, { maximumFractionDigits: 1 }) + ' hrs';
  }

  function fmtYears(n) {
    if (n == null || isNaN(n)) return 'N/A (within horizon)';
    if (n === Infinity) return 'Never';
    if (n < 0) return '< Year 0';
    const yr = Math.floor(n);
    const mo = Math.round((n - yr) * 12);
    if (mo === 0) return `${yr} yr${yr !== 1 ? 's' : ''}`;
    return `${yr} yr${yr !== 1 ? 's' : ''} ${mo} mo`;
  }

  function showEl(id, show) {
    const el = $(id);
    if (el) el.classList.toggle('hidden', !show);
  }

  function setCardClass(id, val) {
    const el = $(id);
    if (!el) return;
    el.classList.remove('positive', 'negative', 'neutral');
    if (val == null || isNaN(val)) el.classList.add('neutral');
    else if (val >= 0) el.classList.add('positive');
    else el.classList.add('negative');
  }

  // ─── READ / WRITE FORM ──────────────────────────────────────────────────────

  function readBaseInputs() {
    return {
      laborRate:            parseFloat($('input-labor-rate').value) || 0,
      currentHoursPerUnit:  parseFloat($('input-current-hours').value) || 0,
      proposedHoursPerUnit: parseFloat($('input-proposed-hours').value) || 0,
      volume:               parseFloat($('input-volume').value) || 0,
      implementationCost:   parseFloat($('input-impl-cost').value) || 0,
      annualOpEx:           parseFloat($('input-annual-opex').value) || 0,
      discountRate:         parseFloat($('input-discount-rate').value) || 0,
      horizon:              parseInt($('input-horizon').value) || 5,
      realizationRate:      parseFloat($('input-realization-rate').value) || 100,
      year1Realization:     parseFloat($('input-year1-realization').value) || 100,
      benefitStartYear:     parseInt($('input-benefit-start-year').value) || 1
    };
  }

  function writeBaseInputs(data) {
    const f = data.financials || {};
    const p = data.production || {};
    const cs = data.currentState || {};
    const fs = data.futureState || {};
    setVal('input-project-name',    (data.meta || {}).projectName || '');
    setVal('input-notes',           (data.meta || {}).notes || '');
    setVal('input-labor-rate',      f.laborRate != null ? f.laborRate : 75);
    setVal('input-current-hours',   cs.hoursPerUnit != null ? cs.hoursPerUnit : 2);
    setVal('input-proposed-hours',  fs.hoursPerUnit != null ? fs.hoursPerUnit : 1);
    setVal('input-volume',          p.volume != null ? p.volume : 1000);
    setVal('input-impl-cost',       f.implementationCost != null ? f.implementationCost : 50000);
    setVal('input-annual-opex',     f.annualOpEx != null ? f.annualOpEx : 5000);
    setVal('input-discount-rate',   f.discountRate != null ? f.discountRate : 10);
    setVal('input-horizon',         f.horizon != null ? f.horizon : 5);
    setVal('input-realization-rate',f.realizationRate != null ? f.realizationRate : 90);
    setVal('input-year1-realization',f.year1Realization != null ? f.year1Realization : 50);
    setVal('input-benefit-start-year',f.benefitStartYear != null ? f.benefitStartYear : 1);
  }

  function getBaseScenarioVars() {
    const i = readBaseInputs();
    return {
      currentHoursPerUnit:  i.currentHoursPerUnit,
      proposedHoursPerUnit: i.proposedHoursPerUnit,
      volume:               i.volume,
      realizationRate:      i.realizationRate,
      implementationCost:   i.implementationCost,
      annualOpEx:           i.annualOpEx
    };
  }

  // ─── PHASE 1 CALCULATION ────────────────────────────────────────────────────

  // Sync all Phase 2 triangular-distribution fields from Phase 1 + process map.
  // Mode always mirrors Phase 1 (which is the PERT expected when a map exists).
  // Min/Max flow from the process map's summed node ranges when nodes exist.
  function syncSimModeValues() {
    const base = readBaseInputs();
    setVal('unc-current-hours-mode',  base.currentHoursPerUnit);
    setVal('unc-proposed-hours-mode', base.proposedHoursPerUnit);

    if (hasProcessNodes()) {
      const d = deriveProcessTimes();
      setVal('unc-current-hours-min',  d.currentMin.toFixed(4));
      setVal('unc-current-hours-max',  d.currentMax.toFixed(4));
      setVal('unc-proposed-hours-min', d.futureMin.toFixed(4));
      setVal('unc-proposed-hours-max', d.futureMax.toFixed(4));

      // Auto-enable a variable's uncertainty row when the map gives it a real range.
      const cRange = d.currentMin !== d.currentMax;
      const fRange = d.futureMin  !== d.futureMax;
      if (cRange) {
        $('unc-current-hours-enabled').checked = true;
        showEl('unc-current-hours-fields', true);
      }
      if (fRange) {
        $('unc-proposed-hours-enabled').checked = true;
        showEl('unc-proposed-hours-fields', true);
      }
    }
  }

  function recalculate() {
    const inputs = readBaseInputs();
    const valid = validateInputs(inputs);
    showEl('validation-msg', !valid.ok);
    if (!valid.ok) {
      $('validation-msg').textContent = valid.msg;
      showEl('results-section', false);
      showEl('empty-state', true);
      runSensitivity();
      return;
    }

    const result = Engine.calculate(inputs);
    renderResults(result, inputs);
    showEl('empty-state', false);
    showEl('results-section', true);
    runSensitivity();
  }

  function validateInputs(inputs) {
    if (inputs.laborRate < 0) return { ok: false, msg: 'Labor rate cannot be negative.' };
    if (inputs.volume < 0) return { ok: false, msg: 'Production volume cannot be negative.' };
    if (inputs.horizon < 1 || !Number.isInteger(inputs.horizon)) return { ok: false, msg: 'Project horizon must be a positive integer.' };
    if (inputs.discountRate < 0) return { ok: false, msg: 'Discount rate cannot be negative.' };
    if (inputs.implementationCost < 0) return { ok: false, msg: 'Implementation cost cannot be negative.' };
    return { ok: true };
  }

  function renderResults(result, inputs) {
    const { annualHoursSaved, annualGrossSavings, npv, roi, paybackPeriod, cumulativeCashFlows, hasNegativeSavings } = result;

    // Metric cards
    $('val-npv').textContent = fmtCurrency(npv);
    $('val-roi').textContent = roi != null ? fmtPct(roi) : '—';
    $('val-payback').textContent = fmtYears(paybackPeriod);
    $('val-hours-saved').textContent = fmtHours(annualHoursSaved);
    $('val-gross-savings').textContent = fmtCurrency(annualGrossSavings);

    setCardClass('card-npv', npv);
    setCardClass('card-roi', roi);

    // Negative savings warning
    showEl('negative-savings-warning', hasNegativeSavings);

    // Cash flow chart
    Charts.renderCashFlow('cashflow-chart', result);

    // Assumptions summary
    renderAssumptions(inputs);
  }

  function renderAssumptions(inputs) {
    const rows = [
      ['Project Horizon', inputs.horizon + ' years'],
      ['Annual Labor Rate', fmtCurrency(inputs.laborRate) + '/hr'],
      ['Current Process Hours/Unit', inputs.currentHoursPerUnit.toFixed(2) + ' hrs'],
      ['Proposed Process Hours/Unit', inputs.proposedHoursPerUnit.toFixed(2) + ' hrs'],
      ['Annual Production Volume', inputs.volume.toLocaleString() + ' units'],
      ['Implementation Cost (CapEx)', fmtCurrency(inputs.implementationCost)],
      ['Annual OpEx', fmtCurrency(inputs.annualOpEx)],
      ['Discount Rate (WACC)', inputs.discountRate + '%'],
      ['Savings Realization Rate', inputs.realizationRate + '%'],
      ['Year 1 Realization', inputs.year1Realization + '%'],
      ['Benefit Start Year', 'Year ' + inputs.benefitStartYear]
    ];
    const html = rows.map(([label, val]) =>
      `<div class="assumption-row"><span class="assumption-label">${label}</span><span class="assumption-val">${val}</span></div>`
    ).join('');
    $('assumptions-body').innerHTML = html;
  }

  // ─── PHASE 1.5 — SCENARIOS ──────────────────────────────────────────────────

  function initScenarios() {
    const base = getBaseScenarioVars();
    if (!state.scenarios) state.scenarios = {};
    if (!state.scenarios.conservative) state.scenarios.conservative = Object.assign({}, base);
    if (!state.scenarios.aggressive) state.scenarios.aggressive = Object.assign({}, base);
  }

  function switchScenarioTab(name) {
    activeScenario = name;
    document.querySelectorAll('.scenario-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.scenario === name);
    });
    showEl('scenario-editable-panel', name !== 'expected');
    showEl('scenario-expected-readonly', name === 'expected');
    if (name !== 'expected') {
      const vars = state.scenarios[name] || getBaseScenarioVars();
      loadScenarioInputs(vars);
    }
    updateScenarioComparison();
  }

  function loadScenarioInputs(vars) {
    setVal('scen-current-hours',    vars.currentHoursPerUnit);
    setVal('scen-proposed-hours',   vars.proposedHoursPerUnit);
    setVal('scen-volume',           vars.volume);
    setVal('scen-realization-rate', vars.realizationRate);
    setVal('scen-impl-cost',        vars.implementationCost);
    setVal('scen-annual-opex',      vars.annualOpEx);
  }

  function readScenarioInputs() {
    return {
      currentHoursPerUnit:  parseFloat($('scen-current-hours').value) || 0,
      proposedHoursPerUnit: parseFloat($('scen-proposed-hours').value) || 0,
      volume:               parseFloat($('scen-volume').value) || 0,
      realizationRate:      parseFloat($('scen-realization-rate').value) || 100,
      implementationCost:   parseFloat($('scen-impl-cost').value) || 0,
      annualOpEx:           parseFloat($('scen-annual-opex').value) || 0
    };
  }

  function saveCurrentScenario() {
    if (activeScenario === 'expected') return;
    state.scenarios[activeScenario] = readScenarioInputs();
    updateScenarioComparison();
  }

  function getScenarioResult(name) {
    const base = readBaseInputs();
    let override;
    if (name === 'expected') {
      override = getBaseScenarioVars();
    } else {
      override = state.scenarios[name] || getBaseScenarioVars();
    }
    const inputs = Object.assign({}, base, override);
    return { inputs, result: Engine.calculate(inputs) };
  }

  function updateScenarioComparison() {
    const names = ['conservative', 'expected', 'aggressive'];
    const labels = { conservative: 'Conservative', expected: 'Expected', aggressive: 'Aggressive' };
    const all = names.map(n => ({ name: n, label: labels[n], ...getScenarioResult(n) }));

    // Determine best/worst NPV
    const npvs = all.map(s => s.result.npv);
    const bestNPV = Math.max(...npvs);
    const worstNPV = Math.min(...npvs);

    // Table
    const rows = [
      { metric: 'NPV', vals: all.map(s => ({ v: s.result.npv, fmt: fmtCurrency(s.result.npv) })), higher: true },
      { metric: 'ROI', vals: all.map(s => ({ v: s.result.roi, fmt: fmtPct(s.result.roi) })), higher: true },
      { metric: 'Payback Period', vals: all.map(s => ({ v: s.result.paybackPeriod, fmt: fmtYears(s.result.paybackPeriod) })), higher: false },
      { metric: 'Annual Hours Saved', vals: all.map(s => ({ v: s.result.annualHoursSaved, fmt: fmtHours(s.result.annualHoursSaved) })), higher: true },
      { metric: 'Annual Gross Savings', vals: all.map(s => ({ v: s.result.annualGrossSavings, fmt: fmtCurrency(s.result.annualGrossSavings) })), higher: true }
    ];

    let tableHtml = '';
    rows.forEach(row => {
      const validVals = row.vals.map(c => c.v).filter(v => v != null && !isNaN(v));
      const best = validVals.length ? (row.higher ? Math.max(...validVals) : Math.min(...validVals)) : null;
      const worst = validVals.length ? (row.higher ? Math.min(...validVals) : Math.max(...validVals)) : null;
      tableHtml += `<tr><td class="metric-label-cell">${row.metric}</td>`;
      row.vals.forEach(cell => {
        let cls = '';
        if (cell.v != null && !isNaN(cell.v)) {
          if (cell.v === best) cls = 'best-val';
          else if (cell.v === worst) cls = 'worst-val';
        }
        tableHtml += `<td class="${cls}">${cell.fmt}</td>`;
      });
      tableHtml += '</tr>';
    });
    $('scenario-table-body').innerHTML = tableHtml;

    // Comparison chart
    Charts.renderScenarioComparison('scenario-chart', all);
  }

  function updateScenarioExpectedReadonly() {
    const base = readBaseInputs();
    const h = (label, val) => `<div class="assumption-row"><span class="assumption-label">${label}</span><span class="assumption-val">${val}</span></div>`;
    $('scenario-expected-readonly').innerHTML =
      '<p class="hint-text">Expected scenario mirrors the Phase 1 base case.</p>' +
      h('Current Hours/Unit', base.currentHoursPerUnit.toFixed(2) + ' hrs') +
      h('Proposed Hours/Unit', base.proposedHoursPerUnit.toFixed(2) + ' hrs') +
      h('Volume', base.volume.toLocaleString() + ' units') +
      h('Realization Rate', base.realizationRate + '%') +
      h('Implementation Cost', fmtCurrency(base.implementationCost)) +
      h('Annual OpEx', fmtCurrency(base.annualOpEx));
  }

  // ─── SENSITIVITY ANALYSIS ───────────────────────────────────────────────────

  function runSensitivity() {
    const swingEl = $('tornado-swing');
    const swing = swingEl ? (parseFloat(swingEl.value) || 0.2) : 0.2;
    const inputs = readBaseInputs();
    const valid = validateInputs(inputs);

    if (!valid.ok) {
      showEl('tornado-empty', true);
      showEl('tornado-chart-wrap', false);
      showEl('tornado-caption', false);
      return;
    }

    const baseNPV = Engine.calculate(inputs).npv;
    if (!isFinite(baseNPV)) {
      showEl('tornado-empty', true);
      showEl('tornado-chart-wrap', false);
      showEl('tornado-caption', false);
      return;
    }

    const variables = [
      { label: 'Labor Rate',          field: 'laborRate' },
      { label: 'Current Hrs/Unit',    field: 'currentHoursPerUnit' },
      { label: 'Proposed Hrs/Unit',   field: 'proposedHoursPerUnit' },
      { label: 'Annual Volume',       field: 'volume' },
      { label: 'Implementation Cost', field: 'implementationCost' },
      { label: 'Annual OpEx',         field: 'annualOpEx' },
      { label: 'Realization Rate',    field: 'realizationRate' }
    ];

    const sensitivities = variables.map(function(v) {
      const base = inputs[v.field];
      const lowInputs  = Object.assign({}, inputs);
      const highInputs = Object.assign({}, inputs);
      lowInputs[v.field]  = base * (1 - swing);
      highInputs[v.field] = base * (1 + swing);
      const lowNPV  = Engine.calculate(lowInputs).npv;
      const highNPV = Engine.calculate(highInputs).npv;
      return { label: v.label, lowNPV: lowNPV, highNPV: highNPV, width: Math.abs(highNPV - lowNPV) };
    });

    sensitivities.sort(function(a, b) { return b.width - a.width; });

    showEl('tornado-empty', false);
    showEl('tornado-chart-wrap', true);
    showEl('tornado-caption', true);
    Charts.renderTornado('tornado-chart', sensitivities, baseNPV);
  }

  // ─── PHASE 2 — SIMULATION ───────────────────────────────────────────────────

  function readSimConfig() {
    return {
      mode: document.querySelector('input[name="sim-mode"]:checked')
              ? document.querySelector('input[name="sim-mode"]:checked').value
              : 'fixed',
      iterations: parseInt($('sim-iterations').value) || 5000,
      seed: $('sim-seed').value.trim(),
      uncertainVars: {
        currentHours: {
          enabled: $('unc-current-hours-enabled').checked,
          min:     parseFloat($('unc-current-hours-min').value) || 0,
          mode:    parseFloat($('unc-current-hours-mode').value) || 0,
          max:     parseFloat($('unc-current-hours-max').value) || 0
        },
        proposedHours: {
          enabled: $('unc-proposed-hours-enabled').checked,
          min:     parseFloat($('unc-proposed-hours-min').value) || 0,
          mode:    parseFloat($('unc-proposed-hours-mode').value) || 0,
          max:     parseFloat($('unc-proposed-hours-max').value) || 0
        }
      }
    };
  }

  function writeSimConfig(simCfg) {
    const m = simCfg.mode || 'fixed';
    const radio = document.querySelector(`input[name="sim-mode"][value="${m}"]`);
    if (radio) radio.checked = true;
    toggleSimMode(m);

    setVal('sim-iterations', simCfg.iterations || 5000);
    setVal('sim-seed', simCfg.seed || '');

    const cv = simCfg.uncertainVars || {};
    const ch = cv.currentHours || {};
    const ph = cv.proposedHours || {};
    $('unc-current-hours-enabled').checked = !!ch.enabled;
    setVal('unc-current-hours-min',  ch.min != null ? ch.min : '');
    setVal('unc-current-hours-mode', ch.mode != null ? ch.mode : '');
    setVal('unc-current-hours-max',  ch.max != null ? ch.max : '');
    $('unc-proposed-hours-enabled').checked = !!ph.enabled;
    setVal('unc-proposed-hours-min',  ph.min != null ? ph.min : '');
    setVal('unc-proposed-hours-mode', ph.mode != null ? ph.mode : '');
    setVal('unc-proposed-hours-max',  ph.max != null ? ph.max : '');
    toggleUncertaintyRows();
  }

  function toggleSimMode(mode) {
    showEl('uncertainty-inputs', mode === 'uncertainty');
    showEl('sim-mode-description', true);
    $('sim-mode-description').textContent = mode === 'fixed'
      ? 'Deterministic mode: uses exact input values.'
      : 'Uncertainty mode: samples from triangular distributions for enabled variables.';
  }

  function toggleUncertaintyRows() {
    const chEnabled = $('unc-current-hours-enabled').checked;
    const phEnabled = $('unc-proposed-hours-enabled').checked;
    showEl('unc-current-hours-fields', chEnabled);
    showEl('unc-proposed-hours-fields', phEnabled);
  }

  function validateSimInputs(cfg, baseInputs) {
    if (cfg.mode !== 'uncertainty') return { ok: true };
    const { currentHours: ch, proposedHours: ph } = cfg.uncertainVars;
    if (ch.enabled) {
      if (ch.min > ch.mode) return { ok: false, msg: 'Current Hours: Min must be ≤ Most Likely.' };
      if (ch.mode > ch.max) return { ok: false, msg: 'Current Hours: Most Likely must be ≤ Max.' };
      if (ch.min < 0) return { ok: false, msg: 'Current Hours distribution cannot have negative values.' };
    }
    if (ph.enabled) {
      if (ph.min > ph.mode) return { ok: false, msg: 'Proposed Hours: Min must be ≤ Most Likely.' };
      if (ph.mode > ph.max) return { ok: false, msg: 'Proposed Hours: Most Likely must be ≤ Max.' };
      if (ph.min < 0) return { ok: false, msg: 'Proposed Hours distribution cannot have negative values.' };
    }
    return { ok: true };
  }

  function runSimulation() {
    const baseInputs = readBaseInputs();
    const baseValid = validateInputs(baseInputs);
    if (!baseValid.ok) {
      alert('Please fix Phase 1 inputs first: ' + baseValid.msg);
      return;
    }
    const cfg = readSimConfig();
    const simValid = validateSimInputs(cfg, baseInputs);
    if (!simValid.ok) {
      $('sim-validation-msg').textContent = simValid.msg;
      showEl('sim-validation-msg', true);
      return;
    }
    showEl('sim-validation-msg', false);

    showEl('sim-empty', false);
    showEl('sim-result-panel', false);
    showEl('sim-running', true);
    $('btn-run-simulation').disabled = true;

    // Defer to let UI update
    setTimeout(() => {
      try {
        const uncertainVars = cfg.mode === 'uncertainty' ? cfg.uncertainVars : { currentHours: { enabled: false }, proposedHours: { enabled: false } };
        simResult = Simulation.run(baseInputs, uncertainVars, { iterations: cfg.iterations, seed: cfg.seed });
        renderSimulationResults(simResult, cfg, baseInputs);
      } finally {
        showEl('sim-running', false);
        showEl('sim-result-panel', true);
        $('btn-run-simulation').disabled = false;
      }
    }, 50);
  }

  function renderSimulationResults(result, cfg, baseInputs) {
    const base = Engine.calculate(baseInputs);
    const mode = cfg.mode;

    $('sim-deterministic-npv').textContent = fmtCurrency(base.npv);
    $('sim-mean-npv').textContent = fmtCurrency(result.mean);
    $('sim-p50-npv').textContent = fmtCurrency(result.p50);
    $('sim-p10-npv').textContent = fmtCurrency(result.p10);
    $('sim-p90-npv').textContent = fmtCurrency(result.p90);
    $('sim-prob-negative').textContent = result.probNegativePct + '%';
    $('sim-iterations-run').textContent = result.iterations.toLocaleString();

    // Probability of payback
    const horizonInt = parseInt($('input-horizon').value) || 5;
    const probPayback = (1 - result.probNegative);
    $('sim-prob-payback').textContent = (probPayback * 100).toFixed(1) + '%';

    // Risk summary
    const pn = parseFloat(result.probNegativePct);
    let riskLevel;
    if (pn < 5) riskLevel = 'low risk';
    else if (pn < 20) riskLevel = 'moderate risk';
    else if (pn < 50) riskLevel = 'high risk';
    else riskLevel = 'very high risk';

    let summary;
    if (mode === 'fixed') {
      summary = `Deterministic analysis run with ${result.iterations.toLocaleString()} iterations. No input uncertainty was enabled. ` +
                `NPV is ${fmtCurrency(result.mean)}.`;
    } else {
      summary = `Based on ${result.iterations.toLocaleString()} simulated scenarios, ` +
                `there is a ${result.probNegativePct}% probability that this project results in a negative NPV — indicating ${riskLevel}. ` +
                `The median (P50) NPV is ${fmtCurrency(result.p50)}, with a range from ${fmtCurrency(result.p10)} (P10) to ${fmtCurrency(result.p90)} (P90).`;
    }
    $('sim-risk-summary').textContent = summary;

    Charts.renderHistogram('histogram-chart', result);
  }

  // ─── PHASE 3 — PROCESS MAPPER ───────────────────────────────────────────────

  function makeNodeId() {
    return 'node-' + (nodeIdCounter++);
  }

  function getActiveNodes() {
    return processState.activeView === 'current' ? processState.currentNodes : processState.futureNodes;
  }

  function getActiveConnections() {
    return processState.activeView === 'current' ? processState.currentConnections : processState.futureConnections;
  }

  function addNode() {
    const nodes = getActiveNodes();
    const x = 80 + (nodes.length % 4) * 180;
    const y = 80 + Math.floor(nodes.length / 4) * 120;
    const id = makeNodeId();
    nodes.push({ id, name: 'New Step', x, y, cycleMin: 0, cycleMost: 0, cycleMax: 0, errorRate: 0, notes: '', category: '' });
    renderProcessMap();
    selectNode(id);
  }

  function deleteNode(id) {
    const nodes = getActiveNodes();
    const conns = getActiveConnections();
    const idx = nodes.findIndex(n => n.id === id);
    if (idx === -1) return;
    nodes.splice(idx, 1);
    // Remove any connections involving this node
    const filtered = conns.filter(c => c.from !== id && c.to !== id);
    if (processState.activeView === 'current') {
      processState.currentConnections = filtered;
    } else {
      processState.futureConnections = filtered;
    }
    if (processState.selectedNodeId === id) {
      processState.selectedNodeId = null;
      showEl('node-props-panel', false);
      showEl('node-props-empty', true);
    }
    renderProcessMap();
    updateProcessSummary();
  }

  function selectNode(id) {
    processState.selectedNodeId = id;
    const nodes = getActiveNodes();
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    setVal('node-name', node.name);
    setVal('node-cycle-min', node.cycleMin != null ? node.cycleMin : 0);
    setVal('node-cycle-mode', node.cycleMost != null ? node.cycleMost : 0);
    setVal('node-cycle-max', node.cycleMax != null ? node.cycleMax : 0);
    setVal('node-error-rate', node.errorRate != null ? node.errorRate : 0);
    setVal('node-notes', node.notes || '');
    setVal('node-category', node.category || '');
    showEl('node-props-panel', true);
    showEl('node-props-empty', false);
    renderProcessMap(); // re-render to update selection highlight
  }

  function saveNodeProperties() {
    const id = processState.selectedNodeId;
    if (!id) return;
    const nodes = getActiveNodes();
    const node = nodes.find(n => n.id === id);
    if (!node) return;
    node.name     = $('node-name').value.trim() || 'Unnamed Step';
    node.cycleMin = parseFloat($('node-cycle-min').value) || 0;
    node.cycleMost= parseFloat($('node-cycle-mode').value) || 0;
    node.cycleMax = parseFloat($('node-cycle-max').value) || 0;
    node.errorRate= parseFloat($('node-error-rate').value) || 0;
    node.notes    = $('node-notes').value.trim();
    node.category = $('node-category').value.trim();
    renderProcessMap();
    updateProcessSummary();
  }

  function cloneCurrentToFuture() {
    if (processState.currentNodes.length === 0) {
      alert('Current State has no steps to clone. Add steps to the Current State first.');
      return;
    }
    const hasExisting = processState.futureNodes.length > 0;
    if (hasExisting && !confirm('This will replace the existing Future State with a copy of the Current State. Continue?')) return;

    // Deep-copy nodes with new IDs, preserving positions
    const idMap = {};
    processState.futureNodes = processState.currentNodes.map(n => {
      const newId = makeNodeId();
      idMap[n.id] = newId;
      return Object.assign({}, n, { id: newId });
    });

    // Deep-copy connections, remapping IDs
    processState.futureConnections = processState.currentConnections.map(c => ({
      from: idMap[c.from],
      to:   idMap[c.to]
    }));

    // Switch to Future State view so user can start editing
    toggleProcessView('future');
  }

  function toggleProcessView(view) {
    processState.activeView = view;
    processState.selectedNodeId = null;
    processState.connectMode = false;
    processState.connectSourceId = null;
    showEl('node-props-panel', false);
    showEl('node-props-empty', true);
    document.querySelectorAll('.view-toggle-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });
    renderProcessMap();
    updateProcessSummary();
  }

  function enterConnectMode() {
    processState.connectMode = true;
    processState.connectSourceId = null;
    $('process-canvas').classList.add('connect-mode');
    $('btn-connect').classList.add('active');
    showProcessHint('Click source node, then destination node to connect.');
  }

  function exitConnectMode() {
    processState.connectMode = false;
    processState.connectSourceId = null;
    $('process-canvas').classList.remove('connect-mode');
    $('btn-connect').classList.remove('active');
    hideProcessHint();
    renderProcessMap();
  }

  function showProcessHint(msg) {
    $('process-hint').textContent = msg;
    showEl('process-hint', true);
  }

  function hideProcessHint() {
    showEl('process-hint', false);
  }

  // PERT expected time: (min + 4*mode + max) / 6
  function pertExpected(node) {
    return (node.cycleMin + 4 * node.cycleMost + node.cycleMax) / 6;
  }

  // Rework multiplier: effective time = base time × (1 + errorRate / 100)
  // Models the fraction of units that must be re-processed through the step.
  function reworkMultiplier(node) {
    return 1 + (node.errorRate || 0) / 100;
  }

  function effectiveCycleExpected(node) {
    return pertExpected(node) * reworkMultiplier(node);
  }

  function deriveProcessTimes() {
    const toHrs = mins => mins / 60;
    const sumBy = (nodes, fn) => nodes.reduce((s, n) => s + fn(n), 0);
    return {
      currentTotal:  toHrs(sumBy(processState.currentNodes, effectiveCycleExpected)),
      futureTotal:   toHrs(sumBy(processState.futureNodes,  effectiveCycleExpected)),
      currentMin:    toHrs(sumBy(processState.currentNodes, n => (n.cycleMin  || 0) * reworkMultiplier(n))),
      currentMax:    toHrs(sumBy(processState.currentNodes, n => (n.cycleMax  || 0) * reworkMultiplier(n))),
      futureMin:     toHrs(sumBy(processState.futureNodes,  n => (n.cycleMin  || 0) * reworkMultiplier(n))),
      futureMax:     toHrs(sumBy(processState.futureNodes,  n => (n.cycleMax  || 0) * reworkMultiplier(n))),
      // Rework-only contribution (effective − base), for the summary bar
      currentRework: toHrs(sumBy(processState.currentNodes, n => pertExpected(n) * (n.errorRate || 0) / 100)),
      futureRework:  toHrs(sumBy(processState.futureNodes,  n => pertExpected(n) * (n.errorRate || 0) / 100))
    };
  }

  function hasProcessNodes() {
    return processState.currentNodes.length > 0 || processState.futureNodes.length > 0;
  }

  function updateProcessSummary() {
    const derived = deriveProcessTimes();
    const { currentTotal, futureTotal, currentMin, currentMax, futureMin, futureMax, currentRework, futureRework } = derived;
    const diff = currentTotal - futureTotal;

    // Update the summary bar in Phase 3
    const summaryEl = $('process-summary');
    if (summaryEl) {
      const reworkNote = rw => rw > 0 ? ` <span class="rework-note">(+${(rw * 60).toFixed(1)} rework)</span>` : '';
      summaryEl.innerHTML =
        `<span><strong>Current State:</strong> ${(currentTotal * 60).toFixed(1)} min/unit${reworkNote(currentRework)}</span>` +
        `<span><strong>Future State:</strong> ${(futureTotal * 60).toFixed(1)} min/unit${reworkNote(futureRework)}</span>` +
        `<span class="${diff >= 0 ? 'summary-positive' : 'summary-negative'}">` +
        `<strong>Improvement:</strong> ${(diff * 60).toFixed(1)} min/unit saved</span>`;
    }

    const mapActive = hasProcessNodes();
    const ciEl = $('input-current-hours');
    const fiEl = $('input-proposed-hours');

    if (mapActive) {
      // ── Phase 1: lock fields and push PERT expected hours ───────────────────
      if (ciEl) { ciEl.value = currentTotal.toFixed(4); ciEl.readOnly = true; }
      if (fiEl) { fiEl.value = futureTotal.toFixed(4);  fiEl.readOnly = true; }
      showEl('map-driven-notice', true);
      if ($('map-driven-text')) {
        $('map-driven-text').textContent =
          `Derived from process map — ${(currentTotal * 60).toFixed(1)} min current · ${(futureTotal * 60).toFixed(1)} min future.`;
      }

      // ── Phase 1.5 scenarios: push min/max hours into Conservative / Aggressive
      // Conservative = smallest savings: current at its best (min) + future at its worst (max)
      // Aggressive   = largest savings:  current at its worst (max) + future at its best (min)
      if (!state.scenarios) state.scenarios = {};
      const baseVars = getBaseScenarioVars();
      state.scenarios.conservative = Object.assign(
        {}, state.scenarios.conservative || baseVars,
        { currentHoursPerUnit: currentMin, proposedHoursPerUnit: futureMax }
      );
      state.scenarios.aggressive = Object.assign(
        {}, state.scenarios.aggressive || baseVars,
        { currentHoursPerUnit: currentMax, proposedHoursPerUnit: futureMin }
      );

      // If the user is currently viewing a scenario's input fields, refresh them
      if (activePhase === '1.5' && activeScenario !== 'expected') {
        loadScenarioInputs(state.scenarios[activeScenario]);
      }
    } else {
      // No nodes — restore manual editing in Phase 1
      if (ciEl) ciEl.readOnly = false;
      if (fiEl) fiEl.readOnly = false;
      showEl('map-driven-notice', false);
    }

    // ── Full cascade ─────────────────────────────────────────────────────────
    recalculate();
    // Phase 2: Mode + Min/Max from map
    syncSimModeValues();
    // Phase 1.5: refresh comparison table and expected display if visible
    if (activePhase === '1.5') {
      updateScenarioExpectedReadonly();
      updateScenarioComparison();
    }
  }

  function getNodeVisualState(node) {
    const other = processState.activeView === 'current' ? processState.futureNodes : processState.currentNodes;
    const match = other.find(n => n.name === node.name);
    if (!match) return processState.activeView === 'current' ? 'removed' : 'added';
    const sameTime = node.cycleMin === match.cycleMin && node.cycleMost === match.cycleMost && node.cycleMax === match.cycleMax;
    return sameTime ? 'unchanged' : 'changed';
  }

  // ─── SVG PROCESS MAP RENDERING ──────────────────────────────────────────────

  const NODE_W = 150, NODE_H = 56, NODE_RX = 8;

  function renderProcessMap() {
    const svg = $('process-canvas');
    if (!svg) return;
    const nodes = getActiveNodes();
    const conns = getActiveConnections();

    // Clear SVG (preserve defs)
    const defs = svg.querySelector('defs');
    svg.innerHTML = '';
    if (defs) svg.appendChild(defs);
    else {
      const d = createSVGDefs();
      svg.appendChild(d);
    }

    // Create layers
    const connLayer = createSVGEl('g', { id: 'conn-layer' });
    const nodeLayer = createSVGEl('g', { id: 'node-layer' });
    svg.appendChild(connLayer);
    svg.appendChild(nodeLayer);

    // Draw connections first (behind nodes)
    conns.forEach(conn => {
      const fromNode = nodes.find(n => n.id === conn.from);
      const toNode = nodes.find(n => n.id === conn.to);
      if (!fromNode || !toNode) return;
      drawConnection(connLayer, fromNode, toNode);
    });

    // Draw nodes
    nodes.forEach(node => {
      const isSelected = node.id === processState.selectedNodeId;
      const isConnSrc = node.id === processState.connectSourceId;
      const visualState = getNodeVisualState(node);
      drawNode(nodeLayer, node, isSelected, isConnSrc, visualState);
    });

    // Empty state
    if (nodes.length === 0) {
      const text = createSVGEl('text', { x: '50%', y: '48%', 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#9ca3af', 'font-size': '14' });
      text.textContent = 'Click "Add Step" to start building your process map';
      svg.appendChild(text);
    }
  }

  function createSVGDefs() {
    const defs = createSVGEl('defs');
    const marker = createSVGEl('marker', { id: 'arrowhead', markerWidth: '10', markerHeight: '7', refX: '10', refY: '3.5', orient: 'auto' });
    const path = createSVGEl('path', { d: 'M 0 0 L 10 3.5 L 0 7 z', fill: '#9ca3af' });
    marker.appendChild(path);
    defs.appendChild(marker);
    return defs;
  }

  function drawNode(layer, node, isSelected, isConnSrc, visualState) {
    const g = createSVGEl('g', {
      class: 'process-node' + (isSelected ? ' selected' : '') + (isConnSrc ? ' conn-source' : ''),
      'data-id': node.id,
      transform: `translate(${node.x},${node.y})`
    });

    const fillColors = { unchanged: '#ffffff', changed: '#fffbeb', added: '#f0fdf4', removed: '#fff1f2' };
    const strokeColors = { unchanged: '#6e57e0', changed: '#f59e0b', added: '#22c55e', removed: '#ef4444' };

    const rect = createSVGEl('rect', {
      width: NODE_W, height: NODE_H, rx: NODE_RX,
      fill: isSelected ? '#ede9fb' : (fillColors[visualState] || '#ffffff'),
      stroke: isConnSrc ? '#22c55e' : (isSelected ? '#6e57e0' : (strokeColors[visualState] || '#6e57e0')),
      'stroke-width': isSelected || isConnSrc ? 2.5 : 1.5
    });

    const title = createSVGEl('text', { x: NODE_W / 2, y: 22, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#1f2937', 'font-size': '13', 'font-weight': '600', class: 'node-title' });
    title.textContent = truncate(node.name, 18);

    const effTime = effectiveCycleExpected(node);
    const hasRework = (node.errorRate || 0) > 0;
    const subtitle = createSVGEl('text', { x: NODE_W / 2, y: 40, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#6b7280', 'font-size': '11' });
    let subtitleText = '';
    if (effTime > 0) {
      subtitleText = effTime.toFixed(1) + ' min';
      if (hasRework) subtitleText += ' \u21ba' + node.errorRate + '%';
      else if (node.category) subtitleText += ' \xb7 ' + truncate(node.category, 10);
    } else if (node.category) {
      subtitleText = truncate(node.category, 14);
    }
    subtitle.textContent = subtitleText;

    g.appendChild(rect);
    g.appendChild(title);
    g.appendChild(subtitle);

    // State badge
    if (visualState !== 'unchanged') {
      const badgeLabels = { changed: '~', added: '+', removed: '×' };
      const badge = createSVGEl('circle', { cx: NODE_W - 8, cy: 8, r: 7, fill: strokeColors[visualState] });
      const badgeText = createSVGEl('text', { x: NODE_W - 8, y: 8, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#fff', 'font-size': '10', 'font-weight': 'bold' });
      badgeText.textContent = badgeLabels[visualState] || '';
      g.appendChild(badge);
      g.appendChild(badgeText);
    }

    g.addEventListener('mousedown', e => onNodeMouseDown(e, node.id));
    g.addEventListener('click', e => onNodeClick(e, node.id));
    layer.appendChild(g);
  }

  function drawConnection(layer, fromNode, toNode) {
    const x1 = fromNode.x + NODE_W;
    const y1 = fromNode.y + NODE_H / 2;
    const x2 = toNode.x;
    const y2 = toNode.y + NODE_H / 2;
    const mx = (x1 + x2) / 2;
    const path = createSVGEl('path', {
      d: `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`,
      fill: 'none',
      stroke: '#9ca3af',
      'stroke-width': 1.5,
      'marker-end': 'url(#arrowhead)'
    });
    layer.appendChild(path);
  }

  function createSVGEl(tag, attrs) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    if (attrs) Object.entries(attrs).forEach(([k, v]) => el.setAttribute(k, v));
    return el;
  }

  function truncate(str, len) {
    return str.length > len ? str.slice(0, len - 1) + '…' : str;
  }

  // ─── SVG DRAG & DROP ────────────────────────────────────────────────────────

  function onNodeMouseDown(e, nodeId) {
    if (processState.connectMode) return;
    e.stopPropagation();
    const svg = $('process-canvas');
    const nodes = getActiveNodes();
    const node = nodes.find(n => n.id === nodeId);
    if (!node) return;
    const pt = svgPoint(svg, e.clientX, e.clientY);
    processState.dragging = { nodeId, startX: pt.x - node.x, startY: pt.y - node.y };
    svg.addEventListener('mousemove', onSVGMouseMove);
    svg.addEventListener('mouseup', onSVGMouseUp);
  }

  function onSVGMouseMove(e) {
    if (!processState.dragging) return;
    const svg = $('process-canvas');
    const pt = svgPoint(svg, e.clientX, e.clientY);
    const nodes = getActiveNodes();
    const node = nodes.find(n => n.id === processState.dragging.nodeId);
    if (!node) return;
    node.x = Math.max(0, pt.x - processState.dragging.startX);
    node.y = Math.max(0, pt.y - processState.dragging.startY);
    renderProcessMap();
  }

  function onSVGMouseUp(e) {
    processState.dragging = null;
    const svg = $('process-canvas');
    svg.removeEventListener('mousemove', onSVGMouseMove);
    svg.removeEventListener('mouseup', onSVGMouseUp);
  }

  function onNodeClick(e, nodeId) {
    if (processState.connectMode) {
      e.stopPropagation();
      if (!processState.connectSourceId) {
        processState.connectSourceId = nodeId;
        renderProcessMap();
        showProcessHint('Now click the destination node.');
      } else if (processState.connectSourceId !== nodeId) {
        const conns = getActiveConnections();
        const exists = conns.some(c => c.from === processState.connectSourceId && c.to === nodeId);
        if (!exists) conns.push({ from: processState.connectSourceId, to: nodeId });
        exitConnectMode();
        renderProcessMap();
      }
    } else {
      e.stopPropagation();
      selectNode(nodeId);
    }
  }

  function svgPoint(svg, cx, cy) {
    const pt = svg.createSVGPoint();
    pt.x = cx;
    pt.y = cy;
    return pt.matrixTransform(svg.getScreenCTM().inverse());
  }

  // ─── SAVE / LOAD / RESET ────────────────────────────────────────────────────

  function buildSavePayload() {
    const base = readBaseInputs();
    const simCfg = readSimConfig();
    return {
      meta: {
        projectName: $('input-project-name').value.trim(),
        notes: $('input-notes').value.trim(),
        createdAt: state.meta && state.meta.createdAt ? state.meta.createdAt : new Date().toISOString()
      },
      financials: {
        laborRate:          base.laborRate,
        discountRate:       base.discountRate,
        horizon:            base.horizon,
        implementationCost: base.implementationCost,
        annualOpEx:         base.annualOpEx,
        realizationRate:    base.realizationRate,
        year1Realization:   base.year1Realization,
        benefitStartYear:   base.benefitStartYear
      },
      production: { volume: base.volume },
      currentState: { hoursPerUnit: base.currentHoursPerUnit },
      futureState:  { hoursPerUnit: base.proposedHoursPerUnit },
      scenarios: state.scenarios,
      simulation: {
        mode:         simCfg.mode,
        iterations:   simCfg.iterations,
        seed:         simCfg.seed,
        uncertainVars: simCfg.uncertainVars
      },
      processMap: {
        source:               hasProcessNodes() ? 'map' : 'manual',
        activeView:           processState.activeView,
        currentNodes:         processState.currentNodes,
        futureNodes:          processState.futureNodes,
        currentConnections:   processState.currentConnections,
        futureConnections:    processState.futureConnections
      }
    };
  }

  function restoreFromPayload(data) {
    state = data;
    // Reset transient UI state
    showEl('sim-result-panel', false);
    showEl('sim-empty', true);
    simResult = null;
    writeBaseInputs(data);

    // Scenarios
    if (data.scenarios) {
      state.scenarios = data.scenarios;
    }

    // Simulation
    if (data.simulation) {
      writeSimConfig(data.simulation);
    }

    // Process map
    if (data.processMap) {
      const pm = data.processMap;
      processState.currentNodes       = pm.currentNodes || [];
      processState.futureNodes        = pm.futureNodes || [];
      processState.currentConnections = pm.currentConnections || [];
      processState.futureConnections  = pm.futureConnections || [];
      processState.activeView         = pm.activeView || 'current';
      processState.selectedNodeId     = null;
      nodeIdCounter = Math.max(...[...processState.currentNodes, ...processState.futureNodes].map(n => parseInt(n.id.split('-')[1]) || 0), 0) + 1;
      renderProcessMap();
      updateProcessSummary();
    }

    recalculate();
  }

  // ─── PHASE SWITCHING ────────────────────────────────────────────────────────

  function switchPhase(phase) {
    activePhase = phase;
    document.querySelectorAll('.phase-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.phase === phase);
    });
    document.querySelectorAll('.phase-panel').forEach(p => {
      p.classList.toggle('hidden', p.dataset.phase !== phase);
    });

    if (phase === '1.5') {
      initScenarios();
      switchScenarioTab(activeScenario);
      updateScenarioExpectedReadonly();
      updateScenarioComparison();
    }
    if (phase === '2') {
      syncSimModeValues();
      runSensitivity();
    }
    if (phase === '3') {
      renderProcessMap();
      updateProcessSummary();
    }
  }

  // ─── INIT & EVENT BINDING ───────────────────────────────────────────────────

  function bindEvents() {
    // Phase tabs
    document.querySelectorAll('.phase-tab').forEach(tab => {
      tab.addEventListener('click', () => switchPhase(tab.dataset.phase));
    });

    // Phase 1 inputs → auto-recalculate
    const p1Inputs = ['input-labor-rate','input-current-hours','input-proposed-hours',
      'input-volume','input-impl-cost','input-annual-opex','input-discount-rate',
      'input-horizon','input-realization-rate','input-year1-realization','input-benefit-start-year'];
    p1Inputs.forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('input', () => {
        recalculate();
        if (activePhase === '1.5') updateScenarioComparison();
        if (activePhase === '2') syncSimModeValues();
      });
    });

    // Save / Load / Reset
    $('btn-save').addEventListener('click', () => Storage.save(buildSavePayload()));
    $('btn-load').addEventListener('click', () => $('file-input').click());
    $('file-input').addEventListener('change', async e => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = await Storage.load(file);
        restoreFromPayload(data);
      } catch (err) {
        alert('Failed to load project: ' + err.message);
      }
      e.target.value = '';
    });
    $('btn-reset').addEventListener('click', () => {
      if (!confirm('Reset all inputs to defaults?')) return;
      processState.currentNodes = [];
      processState.futureNodes = [];
      processState.currentConnections = [];
      processState.futureConnections = [];
      processState.selectedNodeId = null;
      processState.activeView = 'current';
      showEl('node-props-panel', false);
      showEl('node-props-empty', true);
      state = Storage.getDefaults();
      writeBaseInputs(state);
      writeSimConfig(state.simulation);
      state.scenarios = { conservative: null, expected: null, aggressive: null };
      Charts.destroyAll();
      showEl('results-section', false);
      showEl('empty-state', true);
      showEl('sim-result-panel', false);
      showEl('sim-empty', true);
      renderProcessMap();
      updateProcessSummary();
    });

    // Print
    $('btn-print').addEventListener('click', () => window.print());

    // Phase 1.5 scenario tabs
    document.querySelectorAll('.scenario-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (activeScenario !== 'expected') saveCurrentScenario();
        switchScenarioTab(tab.dataset.scenario);
      });
    });

    const scenInputs = ['scen-current-hours','scen-proposed-hours','scen-volume',
                        'scen-realization-rate','scen-impl-cost','scen-annual-opex'];
    scenInputs.forEach(id => {
      const el = $(id);
      if (el) el.addEventListener('input', () => {
        saveCurrentScenario();
        updateScenarioComparison();
      });
    });

    $('btn-clone-to-scenario').addEventListener('click', () => {
      if (activeScenario === 'expected') return;
      state.scenarios[activeScenario] = getBaseScenarioVars();
      loadScenarioInputs(state.scenarios[activeScenario]);
      updateScenarioComparison();
    });

    // Sensitivity swing dropdown
    const swingEl = $('tornado-swing');
    if (swingEl) swingEl.addEventListener('change', runSensitivity);

    // Phase 2 simulation
    document.querySelectorAll('input[name="sim-mode"]').forEach(r => {
      r.addEventListener('change', () => toggleSimMode(r.value));
    });
    $('unc-current-hours-enabled').addEventListener('change', toggleUncertaintyRows);
    $('unc-proposed-hours-enabled').addEventListener('change', toggleUncertaintyRows);
    $('btn-run-simulation').addEventListener('click', runSimulation);

    // Phase 3 process map
    $('btn-view-current').addEventListener('click', () => toggleProcessView('current'));
    $('btn-view-future').addEventListener('click', () => toggleProcessView('future'));
    $('btn-clone-to-future').addEventListener('click', cloneCurrentToFuture);
    $('btn-add-node').addEventListener('click', addNode);
    $('btn-delete-node').addEventListener('click', () => {
      if (processState.selectedNodeId) deleteNode(processState.selectedNodeId);
    });
    $('btn-connect').addEventListener('click', () => {
      if (processState.connectMode) exitConnectMode();
      else enterConnectMode();
    });
    $('btn-save-node-props').addEventListener('click', saveNodeProperties);
    $('process-canvas').addEventListener('click', e => {
      // Ignore clicks that land on a node group or its children
      if (e.target.closest && e.target.closest('.process-node')) return;
      if (processState.connectMode) exitConnectMode();
      else {
        processState.selectedNodeId = null;
        showEl('node-props-panel', false);
        showEl('node-props-empty', true);
        renderProcessMap();
      }
    });

  }

  function init() {
    bindEvents();
    writeBaseInputs(state);
    writeSimConfig(state.simulation);
    switchPhase('1');
    recalculate();
  }

  document.addEventListener('DOMContentLoaded', init);

  return {};
})();
