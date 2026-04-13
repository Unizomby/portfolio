# ProcessWorth

**Process Improvement ROI Calculator**

A browser-based tool that turns process improvement ideas into defensible business cases. Build a process map, model uncertainty, and generate professional financial summaries — all locally, with no server or login required.

---

## Quick Start

1. Open `index.html` in any modern browser (Chrome, Firefox, Safari, Edge).
2. Start in **Process Map** to define your current and future state workflows, or go straight to **Business Case** to enter hours manually.
3. Navigate across the four tabs — values flow automatically between them.

No installation, no dependencies to install, no internet connection required after the initial load.

---

## Tabs Overview

### Process Map
Build visual current-state and future-state workflows using drag-and-drop nodes. Enter cycle time ranges (Min / Most Likely / Max) for each step. The app derives process hours using the PERT formula and automatically pushes those values into every downstream tab.

### Business Case
The core financial calculator. Enter labor rate, volume, investment costs, and financial parameters to produce NPV, ROI, payback period, and a year-by-year cumulative cash flow chart.

### Scenarios
Compare Conservative, Expected, and Aggressive outcomes side by side. When a process map is active, Conservative and Aggressive scenario hours are populated automatically from the map's Min/Max cycle times.

### Risk Analysis
Run a Monte Carlo simulation (5,000 iterations by default) using triangular probability distributions. Produces a histogram of NPV outcomes with P10, P50, and P90 markers, plus a plain-language risk summary. Distribution inputs are auto-populated from the process map when one exists.

---

## How Values Flow

When a process map contains nodes with cycle times, it becomes the source of truth for all downstream calculations automatically — no manual sync required.

```
Process Map node cycle times
    │
    ├─ PERT expected = (Min + 4×Most Likely + Max) / 6
    │       │
    │       ├──▶ Business Case: Current / Proposed Hours/Unit (locked, read-only)
    │       ├──▶ Scenarios:     Expected scenario hours
    │       └──▶ Risk Analysis: Most Likely (mode) for each variable
    │
    ├─ Sum of Min times
    │       ├──▶ Scenarios: Conservative current hours / Aggressive proposed hours
    │       └──▶ Risk Analysis: Min field for each variable
    │
    └─ Sum of Max times
            ├──▶ Scenarios: Conservative proposed hours / Aggressive current hours
            └──▶ Risk Analysis: Max field for each variable
```

When the process map is empty, all Business Case inputs revert to manual entry.

---

## Calculation Definitions

### Annual Hours Saved
```
(Current Hours/Unit − Proposed Hours/Unit) × Annual Production Volume
```

### Annual Gross Savings
```
Annual Hours Saved × Annual Labor Rate
```

### Net Annual Cash Flow
```
(Annual Gross Savings × Savings Realization Rate) − Annual OpEx
```
Year 1 applies the **Year 1 Realization %** as a ramp-up factor instead of the steady-state rate. Years before the **Benefit Start Year** produce only `−Annual OpEx` (costs run, benefits have not yet begun). Year 0 = `−Implementation Cost`.

### Net Present Value (NPV)
```
Σ [ Cash Flow(yr) / (1 + Discount Rate)^yr ]  for yr = 0 … Project Horizon
```
A positive NPV means the project returns more than the cost of capital over the horizon.

### ROI (Simple)
```
(Total Net Benefits − Implementation Cost) / Implementation Cost
```
This is an undiscounted simple ROI. For a time-value-adjusted measure, compare NPV to the initial investment directly.

### Payback Period
The first fractional year at which cumulative cash flow crosses zero, interpolated between years.

### PERT Expected Cycle Time (Process Map)
```
(Min + 4 × Most Likely + Max) / 6
```
Used to derive the expected total process time from node cycle time ranges.

---

## Scenario Logic

| Scenario | Current Hours/Unit | Proposed Hours/Unit | Interpretation |
|---|---|---|---|
| Conservative | Map Min total | Map Max total | Least savings: current is already efficient, future improvement is modest |
| Expected | Map PERT expected | Map PERT expected | Central estimate |
| Aggressive | Map Max total | Map Min total | Most savings: current is inefficient, future improvement is substantial |

All three scenarios share the base financial settings (labor rate, discount rate, horizon, etc.) from the Business Case tab. Only the six variable inputs differ per scenario.

---

## Monte Carlo Simulation

The Risk Analysis engine samples from **triangular distributions** for enabled variables and computes NPV for each iteration.

**Triangular distribution sampling:**
```
Given (min, mode, max) and uniform sample u ∈ [0, 1]:

fc = (mode − min) / (max − min)

if u < fc:  sample = min + √(u × (max−min) × (mode−min))
else:       sample = max − √((1−u) × (max−min) × (max−mode))
```

**Output metrics:**

| Metric | Definition |
|---|---|
| Mean NPV | Average NPV across all iterations |
| P10 | 10th percentile — only 10% of outcomes are worse |
| P50 | Median — half of outcomes fall below this value |
| P90 | 90th percentile — only 10% of outcomes are better |
| Prob. Negative NPV | Share of iterations where NPV < 0 |

A **random seed** can be set for reproducible results. Leave blank for a new random run each time.

---

## Saving and Loading Projects

Use **Save JSON** to download the full project state as a `.processworth.json` file. Use **Load JSON** to restore a saved project. All inputs, scenarios, simulation settings, and process map data are preserved.

The JSON format is human-readable and can be edited directly if needed. See [Data Model](#data-model) below.

---

## Data Model

Saved project files follow this structure:

```json
{
  "version": "1.1",
  "meta": {
    "projectName": "string",
    "notes": "string",
    "createdAt": "ISO 8601 timestamp"
  },
  "financials": {
    "laborRate": 75,
    "discountRate": 10,
    "horizon": 5,
    "implementationCost": 50000,
    "annualOpEx": 5000,
    "realizationRate": 90,
    "year1Realization": 50,
    "benefitStartYear": 1
  },
  "production": { "volume": 1000 },
  "currentState": { "hoursPerUnit": 2 },
  "futureState":  { "hoursPerUnit": 1 },
  "scenarios": {
    "conservative": { "currentHoursPerUnit": 0, "proposedHoursPerUnit": 0, "volume": 0, "realizationRate": 0, "implementationCost": 0, "annualOpEx": 0 },
    "expected":     { "...same shape..." },
    "aggressive":   { "...same shape..." }
  },
  "simulation": {
    "mode": "fixed | uncertainty",
    "iterations": 5000,
    "seed": "string or null",
    "uncertainVars": {
      "currentHours":  { "min": 0, "mode": 0, "max": 0, "enabled": false },
      "proposedHours": { "min": 0, "mode": 0, "max": 0, "enabled": false }
    }
  },
  "processMap": {
    "source": "map | manual",
    "activeView": "current | future",
    "currentNodes": [ { "id": "node-1", "name": "Step Name", "x": 80, "y": 80, "cycleMin": 0, "cycleMost": 0, "cycleMax": 0, "errorRate": 0, "notes": "", "category": "" } ],
    "futureNodes": [],
    "currentConnections": [ { "from": "node-1", "to": "node-2" } ],
    "futureConnections": []
  }
}
```

---

## File Structure

```
ProcessWorth/
├── index.html            Main HTML shell — all four tab panels
├── css/
│   └── styles.css        All styling (layout, cards, charts, print)
├── js/
│   ├── engine.js         Pure calculation engine — NPV, ROI, payback, cash flows
│   ├── simulation.js     Monte Carlo engine — triangular sampling, result analysis
│   ├── storage.js        JSON save / load / default state
│   ├── charts.js         Chart.js wrappers — cash flow, histogram, scenario chart
│   └── app.js            UI controller — state management, event binding, rendering
├── lib/
│   └── chart.min.js      Chart.js 4.4 (bundled locally, no CDN required)
└── ProcessWorth specs.docx  Original product specification
```

### Module responsibilities

| File | Depends on | DOM access |
|---|---|---|
| `engine.js` | nothing | none — pure functions |
| `simulation.js` | `engine.js` | none — pure functions |
| `storage.js` | nothing | only to create `<a>` for download |
| `charts.js` | `chart.min.js` | canvas elements only |
| `app.js` | all of the above | full UI |

Scripts are loaded via plain `<script>` tags in dependency order. No bundler or build step is needed.

---

## Tech Stack

| Concern | Choice |
|---|---|
| Runtime | Browser only — no server, no Node.js |
| JavaScript | Vanilla ES5-compatible, IIFE modules |
| Charts | [Chart.js 4.4](https://www.chartjs.org/) (bundled locally) |
| Styling | Plain CSS with custom properties |
| Storage | Browser file download / `FileReader` API |
| Process map | SVG + native DOM events (no canvas library) |

---

## Printing

Click **Print** in the header to open the browser print dialog. The stylesheet includes `@media print` rules that hide navigation and controls, leaving a clean one-page financial summary of the Business Case tab.

---

## Roadmap

The application was designed in four phases. All four are implemented:

| Phase | Feature | Status |
|---|---|---|
| 1 | Business Case Builder — deterministic NPV/ROI calculator | Complete |
| 1.5 | Scenario Analysis — Conservative / Expected / Aggressive | Complete |
| 2 | Risk Analytics — Monte Carlo simulation, NPV histogram | Complete |
| 3 | Visual Process Mapper — drag-drop SVG node editor | Complete |

Potential future additions per the original specification:
- PDF export and executive summary
- Parallel process timing logic in the mapper

- Cloud save / multi-user collaborationpersonal
- correlation between input variables

- defect / rework impact on cost

- branch probabilities in workflows
- queueing / bottleneck modeling
- shared resource constraints
