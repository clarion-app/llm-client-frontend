import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EvalTrendChart } from './EvalTrendChart';
import type { TrendBucket } from './types';

/**
 * EvalTrendChart.tsx does not exist yet -- this file is written first, per
 * TDD, and is expected to fail at collection time because `./EvalTrendChart`
 * cannot be resolved. That failure is correct and expected here.
 *
 * Conventions assumed below (this test's own contract for the eventual
 * implementation, per research.md D7's hand-built inline-SVG sparkline —
 * no charting dependency):
 *   - root container:      data-testid="eval-trend-chart"
 *   - one mark per bucket: data-testid={`eval-trend-bucket-${bucket.period_date}`}
 *   - five distinguishable per-bucket series, each its own element:
 *       data-testid={`eval-trend-bucket-${period_date}-pass`}
 *       data-testid={`eval-trend-bucket-${period_date}-fail`}
 *       data-testid={`eval-trend-bucket-${period_date}-needs_human_review`}
 *       data-testid={`eval-trend-bucket-${period_date}-unjudged`}
 *       data-testid={`eval-trend-bucket-${period_date}-errored`}
 */

function makeBucket(overrides: Partial<TrendBucket> = {}): TrendBucket {
  return {
    period_date: '2026-08-01',
    pass_count: 5,
    fail_count: 1,
    needs_human_review_count: 2,
    errored_count: 1,
    unjudged_count: 1,
    total_count: 10,
    ...overrides,
  };
}

describe('EvalTrendChart', () => {
  it('renders one visual element per bucket in trend.buckets', () => {
    const buckets = [
      makeBucket({ period_date: '2026-08-01' }),
      makeBucket({ period_date: '2026-08-02' }),
      makeBucket({ period_date: '2026-08-03' }),
    ];

    render(<EvalTrendChart buckets={buckets} />);

    expect(screen.getByTestId('eval-trend-bucket-2026-08-01')).toBeInTheDocument();
    expect(screen.getByTestId('eval-trend-bucket-2026-08-02')).toBeInTheDocument();
    expect(screen.getByTestId('eval-trend-bucket-2026-08-03')).toBeInTheDocument();
  });

  it('renders without crashing for an empty buckets array -- a distinct state from the dashboard empty state itself', () => {
    render(<EvalTrendChart buckets={[]} />);

    expect(screen.getByTestId('eval-trend-chart')).toBeInTheDocument();
  });

  it('renders pass/fail/needs_human_review/unjudged/errored as five distinguishable visual series, not one blended value', () => {
    const bucket = makeBucket({ period_date: '2026-08-05' });

    render(<EvalTrendChart buckets={[bucket]} />);

    const seriesTestIds = [
      'eval-trend-bucket-2026-08-05-pass',
      'eval-trend-bucket-2026-08-05-fail',
      'eval-trend-bucket-2026-08-05-needs_human_review',
      'eval-trend-bucket-2026-08-05-unjudged',
      'eval-trend-bucket-2026-08-05-errored',
    ];

    const elements = seriesTestIds.map((testId) => screen.getByTestId(testId));

    // Every series is present and each is its own distinct DOM node --
    // proving the five counts are rendered as separate visual marks, not
    // collapsed into a single blended figure.
    expect(new Set(elements).size).toBe(5);
  });
});
