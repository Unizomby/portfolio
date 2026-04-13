/**
 * simulation.js — Monte Carlo simulation engine
 * ProcessWorth — Process Improvement ROI Calculator
 */

const Simulation = (() => {

  // Triangular distribution sampler
  function triangularSample(min, mode, max, rng) {
    const u = rng();
    if (min === max) return min;
    const range = max - min;
    if (range === 0) return min;
    const fc = (mode - min) / range;
    if (u < fc) {
      return min + Math.sqrt(u * range * (mode - min));
    } else {
      return max - Math.sqrt((1 - u) * range * (max - mode));
    }
  }

  // Simple LCG seeded PRNG for reproducibility
  function makeSeededRNG(seed) {
    let s = (seed | 0) >>> 0;
    return function () {
      s = Math.imul(1664525, s) + 1013904223;
      return (s >>> 0) / 4294967296;
    };
  }

  function run(baseInputs, uncertainVars, options) {
    const iterations = (options && options.iterations > 0) ? options.iterations : 5000;
    const seedVal = options && options.seed !== '' && options.seed != null ? options.seed : null;
    const rng = seedVal !== null ? makeSeededRNG(seedVal) : Math.random.bind(Math);

    const npvResults = new Array(iterations);
    const { currentHours, proposedHours } = uncertainVars;

    for (let i = 0; i < iterations; i++) {
      const inputs = Object.assign({}, baseInputs);

      if (currentHours && currentHours.enabled) {
        inputs.currentHoursPerUnit = triangularSample(
          currentHours.min, currentHours.mode, currentHours.max, rng
        );
      }
      if (proposedHours && proposedHours.enabled) {
        inputs.proposedHoursPerUnit = triangularSample(
          proposedHours.min, proposedHours.mode, proposedHours.max, rng
        );
      }

      npvResults[i] = Engine.calculateNPV(inputs);
    }

    return analyzeResults(npvResults, baseInputs.horizon);
  }

  function analyzeResults(npvResults, horizon) {
    const n = npvResults.length;
    const sorted = npvResults.slice().sort((a, b) => a - b);

    function percentile(p) {
      const idx = Math.min(n - 1, Math.max(0, Math.ceil(p / 100 * n) - 1));
      return sorted[idx];
    }

    const mean = npvResults.reduce((a, b) => a + b, 0) / n;
    const negCount = sorted.filter(v => v < 0).length;
    const probNegative = negCount / n;

    // Histogram: 30 bins
    const binCount = 30;
    const minVal = sorted[0];
    const maxVal = sorted[n - 1];
    const binWidth = maxVal > minVal ? (maxVal - minVal) / binCount : 1;
    const bins = new Array(binCount).fill(0);
    const binCenters = [];

    for (let i = 0; i < binCount; i++) {
      binCenters.push(minVal + (i + 0.5) * binWidth);
    }

    for (let i = 0; i < n; i++) {
      let idx = Math.floor((npvResults[i] - minVal) / binWidth);
      if (idx >= binCount) idx = binCount - 1;
      if (idx < 0) idx = 0;
      bins[idx]++;
    }

    return {
      iterations: n,
      mean,
      p10: percentile(10),
      p50: percentile(50),
      p90: percentile(90),
      probNegative,
      probNegativePct: (probNegative * 100).toFixed(1),
      histogram: { bins, binCenters, binWidth, min: minVal, max: maxVal }
    };
  }

  return { run };
})();
