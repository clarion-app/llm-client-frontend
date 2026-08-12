import React from 'react';
import type { TrendBucket } from './types';

interface EvalTrendChartProps {
  buckets: TrendBucket[];
}

interface SeriesDefinition {
  key: keyof TrendBucket;
  label: string;
  color: string;
}

const SERIES: SeriesDefinition[] = [
  { key: 'pass_count', label: 'pass', color: '#16a34a' },
  { key: 'fail_count', label: 'fail', color: '#dc2626' },
  { key: 'needs_human_review_count', label: 'needs_human_review', color: '#d97706' },
  { key: 'unjudged_count', label: 'unjudged', color: '#6b7280' },
  { key: 'errored_count', label: 'errored', color: '#7c3aed' },
];

const COLUMN_WIDTH = 24;
const BAR_WIDTH = 18;
const CHART_HEIGHT = 120;

/**
 * A hand-built inline-SVG pass-rate trend sparkline — one stacked column
 * per bucket in trend.buckets, five distinguishable series
 * (pass/fail/needs_human_review/unjudged/errored) so none of the five
 * counts collapse into a single blended figure. No charting dependency.
 */
export function EvalTrendChart({ buckets }: EvalTrendChartProps): React.ReactElement {
  const maxTotal = Math.max(1, ...buckets.map((bucket) => bucket.total_count));
  const width = Math.max(1, buckets.length) * COLUMN_WIDTH;

  return (
    <div data-testid="eval-trend-chart">
      <svg
        width={width}
        height={CHART_HEIGHT}
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        role="img"
        aria-label="Pass rate trend over time"
      >
        {buckets.map((bucket, index) => {
          const x = index * COLUMN_WIDTH;
          let yOffset = CHART_HEIGHT;

          return (
            <g key={bucket.period_date} data-testid={`eval-trend-bucket-${bucket.period_date}`}>
              {SERIES.map((series) => {
                const value = bucket[series.key] as number;
                const barHeight = (value / maxTotal) * CHART_HEIGHT;
                yOffset -= barHeight;

                return (
                  <rect
                    key={series.key}
                    data-testid={`eval-trend-bucket-${bucket.period_date}-${series.label}`}
                    x={x}
                    y={yOffset}
                    width={BAR_WIDTH}
                    height={barHeight}
                    fill={series.color}
                  >
                    <title>{`${bucket.period_date} ${series.label}: ${value}`}</title>
                  </rect>
                );
              })}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
