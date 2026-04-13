/**
 * engine.js — Pure calculation engine (no DOM dependencies)
 * ProcessWorth — Process Improvement ROI Calculator
 */

const Engine = (() => {

  function calculate(inputs) {
    const {
      laborRate = 0,
      currentHoursPerUnit = 0,
      proposedHoursPerUnit = 0,
      volume = 0,
      implementationCost = 0,
      annualOpEx = 0,
      discountRate = 10,
      horizon = 5,
      realizationRate = 90,
      year1Realization = 50,
      benefitStartYear = 1
    } = inputs;

    const dr = discountRate / 100;
    const rr = realizationRate / 100;
    const y1r = year1Realization / 100;
    const horizonInt = Math.max(1, Math.round(horizon));
    const startYr = Math.max(1, Math.round(benefitStartYear));

    // Core operational metrics
    const annualHoursSaved = (currentHoursPerUnit - proposedHoursPerUnit) * volume;
    const annualGrossSavings = annualHoursSaved * laborRate;

    // Build year-by-year cash flows
    const yearLabels = ['Year 0'];
    const cashFlows = [-implementationCost]; // Year 0 = upfront investment
    const cumulativeCashFlows = [-implementationCost];
    let cumulative = -implementationCost;

    for (let yr = 1; yr <= horizonInt; yr++) {
      yearLabels.push(`Year ${yr}`);
      let benefit = 0;
      if (yr >= startYr) {
        const activeBenefitYear = yr - startYr + 1;
        const realization = activeBenefitYear === 1 ? y1r : rr;
        benefit = annualGrossSavings * realization;
      }
      const netCashFlow = benefit - annualOpEx;
      cashFlows.push(netCashFlow);
      cumulative += netCashFlow;
      cumulativeCashFlows.push(cumulative);
    }

    // NPV = sum of discounted cash flows (Year 0 already included)
    let npv = 0;
    for (let yr = 0; yr <= horizonInt; yr++) {
      npv += cashFlows[yr] / Math.pow(1 + dr, yr);
    }

    // Simple ROI: (Total Net Benefits - Initial Cost) / Initial Cost
    const totalNetBenefits = cashFlows.slice(1).reduce((a, b) => a + b, 0);
    let roi = null;
    if (implementationCost > 0) {
      roi = (totalNetBenefits - implementationCost) / implementationCost;
    }

    // Payback period: first fractional year where cumulative CF crosses 0
    let paybackPeriod = null;
    if (cumulativeCashFlows[0] >= 0) {
      paybackPeriod = 0;
    } else {
      for (let yr = 1; yr < cumulativeCashFlows.length; yr++) {
        if (cumulativeCashFlows[yr] >= 0) {
          const prev = cumulativeCashFlows[yr - 1];
          const curr = cumulativeCashFlows[yr];
          const yearCF = cashFlows[yr];
          if (yearCF > 0) {
            paybackPeriod = (yr - 1) + (Math.abs(prev) / yearCF);
          } else {
            paybackPeriod = yr;
          }
          break;
        }
      }
    }

    return {
      annualHoursSaved,
      annualGrossSavings,
      yearLabels,
      cashFlows,
      cumulativeCashFlows,
      npv,
      roi,
      paybackPeriod,
      totalNetBenefits,
      hasNegativeSavings: annualHoursSaved < 0
    };
  }

  // Lightweight NPV-only calculation for simulation use
  function calculateNPV(inputs) {
    return calculate(inputs).npv;
  }

  return { calculate, calculateNPV };
})();
