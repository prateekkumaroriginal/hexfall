import { describe, expect, it } from 'vitest';
import { FrameDiagnostics } from './diagnostics';

describe('gameplay diagnostics', () => {
  it('reports no measurement before gameplay', () => {
    expect(new FrameDiagnostics().summary().fps).toBeNull();
  });
  it('distinguishes slow frame intervals from CPU submission time', () => {
    const samples = new FrameDiagnostics();
    for (let i = 0; i < 20; i++) samples.record(100, 2);
    expect(samples.summary()).toEqual({
      sampledSeconds: 2,
      fps: 10,
      averageFrameMs: 100,
      worstFrameMs: 100,
      averageCpuSubmissionMs: 2,
    });
  });
  it('bounds history and discards an old stall', () => {
    const samples = new FrameDiagnostics();
    samples.record(1000, 500);
    for (let i = 0; i < 750; i++) samples.record(20, 1);
    expect(samples.summary()).toEqual({
      sampledSeconds: 15,
      fps: 50,
      averageFrameMs: 20,
      worstFrameMs: 20,
      averageCpuSubmissionMs: 1,
    });
  });
});
