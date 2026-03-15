import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Publication } from '@/types/database';

interface PublicationTimelineProps {
  publications: Publication[];
}

interface YearData {
  year: string;
  count: number;
}

export function PublicationTimeline({ publications }: PublicationTimelineProps) {
  const data = useMemo(() => {
    const yearCounts = new Map<number, number>();

    publications.forEach((pub) => {
      if (pub.year) {
        yearCounts.set(pub.year, (yearCounts.get(pub.year) || 0) + 1);
      }
    });

    if (yearCounts.size === 0) return [];

    // Fill in gaps between min and max year
    const years = Array.from(yearCounts.keys());
    const minYear = Math.min(...years);
    const maxYear = Math.max(...years);

    const result: YearData[] = [];
    for (let y = minYear; y <= maxYear; y++) {
      result.push({
        year: String(y),
        count: yearCounts.get(y) || 0,
      });
    }

    return result;
  }, [publications]);

  const maxCount = useMemo(() => Math.max(...data.map((d) => d.count), 1), [data]);

  if (data.length === 0) {
    return (
      <div className="flex flex-col h-full min-h-0">
        <span className="text-sm font-mono text-muted-foreground pb-2">// timeline</span>
        <div className="flex-1 min-h-0 flex items-center justify-center rounded-lg bg-background/50 border text-muted-foreground font-mono text-sm">
          // no publication years to visualize
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full min-h-0">
      <span className="text-sm font-mono text-muted-foreground pb-2">// timeline</span>
      <div className="flex-1 min-h-0 rounded-lg bg-background/50 border p-2 sm:p-3">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(240, 5%, 18%)" vertical={false} />
            <XAxis
              dataKey="year"
              tick={{ fill: 'hsl(240, 5%, 55%)', fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }}
              tickLine={false}
              axisLine={{ stroke: 'hsl(240, 5%, 18%)' }}
              interval={data.length > 20 ? Math.floor(data.length / 10) : 0}
            />
            <YAxis
              tick={{ fill: 'hsl(240, 5%, 55%)', fontSize: 10, fontFamily: '"JetBrains Mono", monospace' }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload as YearData;
                return (
                  <div className="rounded-lg border border-border/50 bg-background px-3 py-2 shadow-xl">
                    <p className="font-mono text-xs text-muted-foreground">{d.year}</p>
                    <p className="font-mono text-sm text-foreground">{d.count}_papers</p>
                  </div>
                );
              }}
              cursor={{ fill: 'hsl(262, 83%, 65%, 0.08)' }}
            />
            <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={40}>
              {data.map((entry, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={entry.count === maxCount
                    ? 'hsl(262, 83%, 65%)'
                    : 'hsl(262, 60%, 50%)'
                  }
                  fillOpacity={0.3 + (entry.count / maxCount) * 0.7}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
