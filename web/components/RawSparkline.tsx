"use client";

interface RawSparklineProps {
  values: number[];
  height?: number;
  formatValue?: (value: number) => string;
  /** Valgfri horisontal referanselinje, f.eks. 0 kg eller tare-offset. */
  referenceValue?: number;
}

// Enkel sanntids-sparkline for rå ADC-verdi / kg over tid. Dette er en
// levende strøm (ikke et historisk datasett man utforsker), så vi viser
// siste verdi direkte på grafen i stedet for en hover-crosshair — det
// gir mer verdi her enn å kunne peke på et punkt som allerede har rullet forbi.
export function RawSparkline({
  values,
  height = 96,
  formatValue = (v) => v.toFixed(0),
  referenceValue,
}: RawSparklineProps) {
  const width = 400;
  const padding = 10;

  if (values.length < 2) {
    return (
      <div
        className="flex items-center justify-center text-sm"
        style={{ height, color: "var(--viz-text-muted)" }}
      >
        Venter på data …
      </div>
    );
  }

  const allValues =
    referenceValue !== undefined ? [...values, referenceValue] : values;
  const min = Math.min(...allValues);
  const max = Math.max(...allValues);
  const range = max - min || 1;

  const toX = (i: number) =>
    padding + (i / (values.length - 1)) * (width - padding * 2);
  const toY = (v: number) => {
    const t = (v - min) / range;
    return height - padding - t * (height - padding * 2);
  };

  const linePoints = values.map((v, i) => `${toX(i)},${toY(v)}`).join(" ");
  const areaPoints = `${toX(0)},${height - padding} ${linePoints} ${toX(
    values.length - 1
  )},${height - padding}`;

  const lastIndex = values.length - 1;
  const lastValue = values[lastIndex];
  const lastX = toX(lastIndex);
  const lastY = toY(lastValue);

  return (
    <div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        preserveAspectRatio="none"
        role="img"
        aria-label="Sanntidsgraf over sensorverdi"
      >
        {referenceValue !== undefined && (
          <line
            x1={padding}
            x2={width - padding}
            y1={toY(referenceValue)}
            y2={toY(referenceValue)}
            stroke="var(--viz-baseline)"
            strokeWidth={1}
          />
        )}
        <polygon
          points={areaPoints}
          fill="var(--viz-series-1)"
          opacity={0.1}
          stroke="none"
        />
        <polyline
          points={linePoints}
          fill="none"
          stroke="var(--viz-series-1)"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        <circle
          cx={lastX}
          cy={lastY}
          r={4}
          fill="var(--viz-series-1)"
          stroke="var(--viz-surface)"
          strokeWidth={2}
        />
      </svg>
      <div
        className="mt-1 text-right text-xs"
        style={{
          color: "var(--viz-text-secondary)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {formatValue(lastValue)}
      </div>
    </div>
  );
}
