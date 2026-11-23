import { runVerdict, modelMemoryBudgetMB, modelWarningThresholdMB, dirtyIdleBudgetMB, dirtyBudgetMB } from '../../../src/services/memoryBudget';

const TOTAL_MB = 8192;
const budget = modelMemoryBudgetMB(TOTAL_MB, 'android');
const warn = modelWarningThresholdMB(TOTAL_MB, 'android');

describe('runVerdict', () => {
  it('runs just under the warning threshold, is tight just over it, and wont just over the budget', () => {
    expect(runVerdict(warn - 1, TOTAL_MB, { policy: 'balanced', platform: 'android' }).verdict).toBe('runs');
    expect(runVerdict(warn + 1, TOTAL_MB, { policy: 'balanced', platform: 'android' }).verdict).toBe('tight');
    expect(runVerdict(budget - 1, TOTAL_MB, { policy: 'balanced', platform: 'android' }).verdict).toBe('tight');
    expect(runVerdict(budget + 1, TOTAL_MB, { policy: 'balanced', platform: 'android' }).verdict).toBe('wont');
  });

  it('reports the need and the allowance in GB', () => {
    const r = runVerdict(budget + 1, TOTAL_MB, { policy: 'balanced', platform: 'android' });
    expect(r.allowGB).toBe(Math.round(budget) / 1024);
    expect(r.needGB).toBe((budget + 1) / 1024);
  });

  it('lets aggressive loading take what balanced refuses', () => {
    const over = budget + 1;
    expect(runVerdict(over, TOTAL_MB, { policy: 'balanced', platform: 'android' }).verdict).toBe('wont');
    expect(runVerdict(over, TOTAL_MB, { policy: 'aggressive', platform: 'android' }).verdict).not.toBe('wont');
    expect(runVerdict(over, TOTAL_MB, { policy: 'aggressive', platform: 'android' }).allowGB)
      .toBe(Math.round(modelMemoryBudgetMB(TOTAL_MB, 'android', 'aggressive')) / 1024);
  });

  it('holds a dirty model to the dirty idle budget, below the plain budget', () => {
    const idle = dirtyIdleBudgetMB(TOTAL_MB, { platform: 'android' });
    expect(idle).toBe(dirtyBudgetMB({ availableMB: budget, residentMB: 0, totalRamMB: TOTAL_MB }, { platform: 'android' }));
    expect(idle).toBeLessThan(budget);
    expect(runVerdict(idle + 1, TOTAL_MB, { platform: 'android', dirty: true }).verdict).toBe('wont');
    expect(runVerdict(idle + 1, TOTAL_MB, { platform: 'android' }).verdict).not.toBe('wont');
    expect(runVerdict(idle + 1, TOTAL_MB, { platform: 'android', dirty: true }).allowGB).toBe(idle / 1024);
  });

  it('never lets aggressive loading take a dirty model past the balanced ceiling', () => {
    const big = 24 * 1024;
    expect(dirtyIdleBudgetMB(big, { platform: 'android', policy: 'aggressive' }))
      .toBeLessThanOrEqual(modelMemoryBudgetMB(big, 'android', 'balanced'));
  });
});
