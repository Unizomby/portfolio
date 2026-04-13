/**
 * charts.js — Chart.js wrappers
 * ProcessWorth — Process Improvement ROI Calculator
 */

const Charts = (() => {
  const instances = {};
  const PRIMARY = '#6e57e0';
  const PRIMARY_LIGHT = 'rgba(110,87,224,0.18)';
  const SUCCESS = '#22c55e';
  const DANGER = '#ef4444';
  const WARNING = '#f59e0b';
  const GRAY = '#9ca3af';

  function destroy(id) {
    if (instances[id]) {
      instances[id].destroy();
      delete instances[id];
    }
  }

  function destroyAll() {
    Object.keys(instances).forEach(id => destroy(id));
  }

  function fmt(n) {
    if (n == null || isNaN(n)) return '—';
    const abs = Math.abs(n);
    if (abs >= 1e6) return '$' + (n / 1e6).toFixed(2) + 'M';
    if (abs >= 1e3) return '$' + (n / 1e3).toFixed(1) + 'K';
    return '$' + n.toFixed(0);
  }

  // Phase 1: Cumulative Cash Flow bar/line chart
  function renderCashFlow(canvasId, result) {
    destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const { yearLabels, cumulativeCashFlows } = result;
    const colors = cumulativeCashFlows.map(v => v >= 0 ? 'rgba(34,197,94,0.75)' : 'rgba(239,68,68,0.75)');
    const borderColors = cumulativeCashFlows.map(v => v >= 0 ? SUCCESS : DANGER);

    instances[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: yearLabels,
        datasets: [{
          label: 'Cumulative Cash Flow',
          data: cumulativeCashFlows,
          backgroundColor: colors,
          borderColor: borderColors,
          borderWidth: 1.5,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ' ' + fmt(ctx.raw)
            }
          }
        },
        scales: {
          y: {
            ticks: {
              callback: v => fmt(v)
            },
            grid: { color: 'rgba(0,0,0,0.05)' }
          },
          x: {
            grid: { display: false }
          }
        }
      }
    });
  }

  // Phase 2: NPV Histogram
  function renderHistogram(canvasId, simResult) {
    destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const { histogram, p10, p50, p90 } = simResult;
    const { bins, binCenters, binWidth, min: histMin } = histogram;

    const bgColors = binCenters.map(c => c < 0 ? 'rgba(239,68,68,0.65)' : PRIMARY_LIGHT);
    const borderCols = binCenters.map(c => c < 0 ? DANGER : PRIMARY);
    const labels = binCenters.map(c => fmt(c));

    // Map an NPV value → its bin index (used by the afterDraw plugin below)
    function findBinIdx(val) {
      if (binWidth === 0) return 0;
      return Math.max(0, Math.min(bins.length - 1,
        Math.floor((val - histMin) / binWidth)
      ));
    }

    // Draw P10 / P50 / P90 directly on the canvas in pixel space.
    // This avoids the categorical-vs-linear scale mismatch that breaks
    // scatter-dataset overlays on a bar chart.
    const percentilePlugin = {
      id: 'percentileLines',
      afterDraw(chart) {
        const { ctx, chartArea, scales } = chart;
        if (!chartArea || !scales.x) return;
        const xScale = scales.x;

        const markers = [
          { label: 'P10', value: p10, color: WARNING,  dash: [4, 3] },
          { label: 'P50', value: p50, color: PRIMARY,  dash: [6, 3] },
          { label: 'P90', value: p90, color: SUCCESS,  dash: [4, 3] }
        ];

        markers.forEach(({ label, value, color, dash }) => {
          const idx = findBinIdx(value);
          // getPixelForValue on a CategoryScale returns the bar center for index idx
          const x = xScale.getPixelForValue(idx);

          ctx.save();

          // Dashed vertical line
          ctx.beginPath();
          ctx.setLineDash(dash);
          ctx.moveTo(x, chartArea.top);
          ctx.lineTo(x, chartArea.bottom);
          ctx.strokeStyle = color;
          ctx.lineWidth = 2;
          ctx.stroke();

          // Filled downward-pointing triangle at the top of the line
          const ty = chartArea.top;
          const th = 10, tw = 7;
          ctx.beginPath();
          ctx.setLineDash([]);
          ctx.moveTo(x - tw, ty - th);
          ctx.lineTo(x + tw, ty - th);
          ctx.lineTo(x,      ty);
          ctx.closePath();
          ctx.fillStyle = color;
          ctx.fill();

          // Label above the triangle
          ctx.fillStyle = color;
          ctx.font = 'bold 10px sans-serif';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'bottom';
          ctx.fillText(label, x, ty - th - 1);

          ctx.restore();
        });
      }
    };

    instances[canvasId] = new Chart(canvas, {
      type: 'bar',
      plugins: [percentilePlugin],
      data: {
        labels,
        datasets: [{
          label: 'Frequency',
          data: bins,
          backgroundColor: bgColors,
          borderColor: borderCols,
          borderWidth: 1,
          borderRadius: 2,
          barPercentage: 1.0,
          categoryPercentage: 1.0
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        layout: {
          padding: { top: 28 }   // room for the triangle markers + labels
        },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              title: ctx => 'NPV ≈ ' + ctx[0].label,
              label: ctx => ctx.raw + ' iterations'
            }
          }
        },
        scales: {
          x: {
            ticks: { maxTicksLimit: 8, maxRotation: 0 },
            grid: { display: false }
          },
          y: {
            title: { display: true, text: 'Count' },
            grid: { color: 'rgba(0,0,0,0.05)' }
          }
        }
      }
    });
  }

  // Phase 1.5: Scenario comparison chart
  function renderScenarioComparison(canvasId, scenarios) {
    destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const labels = ['Conservative', 'Expected', 'Aggressive'];
    const npvData = scenarios.map(s => s && s.result ? s.result.npv : 0);
    const colors = npvData.map(v => v >= 0 ? 'rgba(110,87,224,0.75)' : 'rgba(239,68,68,0.65)');
    const borders = npvData.map(v => v >= 0 ? PRIMARY : DANGER);

    instances[canvasId] = new Chart(canvas, {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'NPV',
          data: npvData,
          backgroundColor: colors,
          borderColor: borders,
          borderWidth: 1.5,
          borderRadius: 6
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ' NPV: ' + fmt(ctx.raw)
            }
          }
        },
        scales: {
          y: {
            ticks: { callback: v => fmt(v) },
            grid: { color: 'rgba(0,0,0,0.05)' }
          },
          x: { grid: { display: false } }
        }
      }
    });
  }

  // Sensitivity Analysis: Tornado Chart
  function renderTornado(canvasId, data, baseNPV) {
    destroy(canvasId);
    const canvas = document.getElementById(canvasId);
    if (!canvas || !data || data.length === 0) return;

    const labels = data.map(function(d) { return d.label; });

    // Upside dataset: baseNPV → better end of the range
    const upsideData = data.map(function(d) {
      return [baseNPV, Math.max(d.lowNPV, d.highNPV)];
    });

    // Downside dataset: worse end → baseNPV
    const downsideData = data.map(function(d) {
      return [Math.min(d.lowNPV, d.highNPV), baseNPV];
    });

    // Dashed vertical line at base NPV
    const baselinePlugin = {
      id: 'tornadoBaseline',
      afterDraw: function(chart) {
        var ctx = chart.ctx, chartArea = chart.chartArea, scales = chart.scales;
        if (!chartArea || !scales.x) return;
        var x = scales.x.getPixelForValue(baseNPV);

        ctx.save();
        ctx.beginPath();
        ctx.setLineDash([5, 3]);
        ctx.moveTo(x, chartArea.top);
        ctx.lineTo(x, chartArea.bottom);
        ctx.strokeStyle = '#374151';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        ctx.setLineDash([]);
        ctx.font = 'bold 9px sans-serif';
        ctx.fillStyle = '#374151';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText('Base', x, chartArea.top + 2);
        ctx.restore();
      }
    };

    instances[canvasId] = new Chart(canvas, {
      type: 'bar',
      plugins: [baselinePlugin],
      data: {
        labels: labels,
        datasets: [
          {
            label: 'Upside',
            data: upsideData,
            backgroundColor: 'rgba(34,197,94,0.6)',
            borderColor: SUCCESS,
            borderWidth: 1,
            borderRadius: 2,
            borderSkipped: false
          },
          {
            label: 'Downside',
            data: downsideData,
            backgroundColor: 'rgba(239,68,68,0.55)',
            borderColor: DANGER,
            borderWidth: 1,
            borderRadius: 2,
            borderSkipped: false
          }
        ]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            mode: 'index',
            intersect: false,
            callbacks: {
              title: function(ctx) { return ctx[0] ? ctx[0].label : ''; },
              label: function(ctx) {
                var raw = ctx.raw;
                if (!Array.isArray(raw)) return '';
                var lo = raw[0], hi = raw[1];
                var dir = ctx.datasetIndex === 0 ? 'High' : 'Low';
                return ' ' + dir + ': ' + fmt(lo) + ' → ' + fmt(hi);
              }
            }
          }
        },
        scales: {
          x: {
            ticks: { callback: function(v) { return fmt(v); }, maxTicksLimit: 6 },
            grid: { color: 'rgba(0,0,0,0.05)' }
          },
          y: {
            grid: { display: false }
          }
        }
      }
    });
  }

  return {
    renderCashFlow,
    renderHistogram,
    renderScenarioComparison,
    renderTornado,
    destroyAll,
    fmt
  };
})();
