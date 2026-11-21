"use client";

import { Bar, BarChart, CartesianGrid, LabelList, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type BarSeries = { key: string; label: string; color: string };

/**
 * Accessible bar chart: thin rounded bars, recessive grid, hover tooltip,
 * a legend for 2+ series, value labels only when there are few bars,
 * and a table view for screen readers / exact numbers.
 */
export function BarChartView({
  data,
  categoryKey,
  series,
  height = 280,
  caption,
}: {
  data: Record<string, string | number>[];
  categoryKey: string;
  series: BarSeries[];
  height?: number;
  caption: string;
}) {
  const showLabels = data.length * series.length <= 12;
  return (
    <figure className="space-y-3">
      <div style={{ height }} aria-hidden>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart accessibilityLayer={false} data={data} margin={{ top: 20, right: 8, left: -12, bottom: 0 }} barGap={2} barCategoryGap="28%">
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey={categoryKey} tickLine={false} axisLine={{ stroke: "var(--border)" }} tick={{ fill: "var(--muted-foreground)", fontSize: 13 }} interval={0} />
            <YAxis allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} width={40} />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 8, color: "var(--popover-foreground)", fontSize: 13 }}
              labelStyle={{ fontWeight: 600, color: "var(--popover-foreground)" }}
              itemStyle={{ color: "var(--popover-foreground)" }}
            />
            {series.length > 1 && (
              <Legend
                iconType="circle"
                iconSize={10}
                wrapperStyle={{ fontSize: 13 }}
                formatter={(value) => <span style={{ color: "var(--foreground)" }}>{value}</span>}
              />
            )}
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} name={s.label} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={40}>
                {showLabels && <LabelList dataKey={s.key} position="top" style={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 600 }} />}
              </Bar>
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground hover:text-foreground">View as table</summary>
        <table className="mt-2 w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b">
              <th scope="col" className="py-1.5 font-semibold">{categoryKey === "name" ? "Item" : categoryKey}</th>
              {series.map((s) => <th key={s.key} scope="col" className="py-1.5 text-right font-semibold">{s.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={String(row[categoryKey])} className="border-b last:border-0">
                <th scope="row" className="py-1.5 font-normal">{row[categoryKey]}</th>
                {series.map((s) => <td key={s.key} className="py-1.5 text-right tabular-nums">{row[s.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </details>
      <figcaption className="sr-only">{caption}</figcaption>
    </figure>
  );
}
