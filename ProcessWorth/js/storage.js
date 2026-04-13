/**
 * storage.js — Save / Load / Reset project data
 * ProcessWorth — Process Improvement ROI Calculator
 */

const Storage = (() => {

  const SCHEMA_VERSION = '1.1';

  const DEFAULTS = {
    version: SCHEMA_VERSION,
    meta: {
      projectName: 'New Project',
      notes: '',
      createdAt: null
    },
    financials: {
      laborRate: 75,
      discountRate: 10,
      horizon: 5,
      implementationCost: 50000,
      annualOpEx: 5000,
      realizationRate: 90,
      year1Realization: 50,
      benefitStartYear: 1
    },
    production: {
      volume: 1000
    },
    currentState: {
      hoursPerUnit: 2
    },
    futureState: {
      hoursPerUnit: 1
    },
    scenarios: {
      conservative: null,
      expected: null,
      aggressive: null
    },
    simulation: {
      mode: 'fixed',
      iterations: 5000,
      seed: '',
      uncertainVars: {
        currentHours: { min: 1.5, mode: 2, max: 2.5, enabled: false },
        proposedHours: { min: 0.75, mode: 1, max: 1.25, enabled: false }
      }
    },
    processMap: {
      source: 'manual',
      activeView: 'current',
      currentNodes: [],
      futureNodes: [],
      currentConnections: [],
      futureConnections: []
    }
  };

  function getDefaults() {
    return JSON.parse(JSON.stringify(DEFAULTS));
  }

  function save(data) {
    const payload = Object.assign({}, data, {
      version: SCHEMA_VERSION,
      savedAt: new Date().toISOString()
    });
    const json = JSON.stringify(payload, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const filename = (data.meta && data.meta.projectName
      ? data.meta.projectName.replace(/[^a-z0-9_\-\s]/gi, '').trim() || 'project'
      : 'project') + '.processworth.json';
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function load(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const data = JSON.parse(e.target.result);
          resolve(data);
        } catch (err) {
          reject(new Error('Invalid JSON file.'));
        }
      };
      reader.onerror = () => reject(new Error('Failed to read file.'));
      reader.readAsText(file);
    });
  }

  return { getDefaults, save, load };
})();
