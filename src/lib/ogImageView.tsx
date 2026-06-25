/* eslint-disable react-perf/jsx-no-new-object-as-prop -- @vercel/og renders this static tree once per image request. */
import type { CSSProperties, ReactElement } from "react";

import { buildOgImageModel, formatSvgNumber, OG_CHART, type OgColors } from "./ogImage";

function TextLine({
  children,
  style,
  x,
  y,
}: {
  children: string;
  style: CSSProperties;
  x: number;
  y: number;
}): ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        whiteSpace: "nowrap",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

function textLinesElements(
  lines: string[],
  keyPrefix: string,
  x: number,
  y: number,
  lineHeight: number,
  style: CSSProperties,
): ReactElement[] {
  return lines.map((line, index) => (
    <TextLine key={`${keyPrefix}-${line}`} x={x} y={y + index * lineHeight} style={style}>
      {line}
    </TextLine>
  ));
}

function MetricBlock({
  colors,
  label,
  value,
  y,
}: {
  colors: OgColors;
  label: string;
  value: string;
  y: number;
}): ReactElement {
  return (
    <>
      <TextLine
        x={862}
        y={y}
        style={{
          color: colors.metricLabel,
          fontSize: 22,
          fontWeight: 700,
          lineHeight: "28px",
        }}
      >
        {label}
      </TextLine>
      <TextLine
        x={862}
        y={y + 38}
        style={{
          color: colors.metricValue,
          fontSize: 42,
          fontWeight: 700,
          lineHeight: "50px",
        }}
      >
        {value}
      </TextLine>
    </>
  );
}

export function renderOgImage(url: URL): ReactElement {
  const model = buildOgImageModel(url);
  const { colors } = model;
  const titleTop = model.variant === "generic" ? 152 : 182;
  const bodyTop = model.variant === "generic" ? 470 : 478;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: colors.bg,
        color: colors.title,
        fontFamily: "geist, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 48,
          top: 42,
          width: 1104,
          height: 546,
          background: colors.panel,
          border: `2px solid ${colors.panelStroke}`,
          borderRadius: 28,
        }}
      />

      <TextLine
        x={86}
        y={80}
        style={{
          color: colors.brand,
          fontSize: 28,
          fontWeight: 700,
          lineHeight: "32px",
        }}
      >
        npm.tax
      </TextLine>

      {model.badge ? (
        <TextLine
          x={86}
          y={140}
          style={{
            color: colors.eyebrow,
            fontSize: 26,
            fontWeight: 700,
            lineHeight: "32px",
          }}
        >
          {model.badge}
        </TextLine>
      ) : null}

      {textLinesElements(model.titleLines, "title", 86, titleTop, 58, {
        color: colors.title,
        fontSize: 50,
        fontWeight: 700,
        lineHeight: "56px",
        letterSpacing: -1.6,
      })}

      <svg
        width={OG_CHART.width}
        height={OG_CHART.height}
        viewBox={`0 0 ${OG_CHART.width} ${OG_CHART.height}`}
        style={{
          position: "absolute",
          left: OG_CHART.x,
          top: OG_CHART.y,
        }}
      >
        <line
          x1={0}
          y1={0}
          x2={0}
          y2={OG_CHART.height}
          stroke={colors.line}
          strokeWidth={2}
          opacity={0.72}
        />
        <line
          x1={0}
          y1={OG_CHART.height}
          x2={OG_CHART.width}
          y2={OG_CHART.height}
          stroke={colors.line}
          strokeWidth={2}
          opacity={0.72}
        />
        <path
          d={model.chartPath}
          stroke="#e11d48"
          strokeWidth={8}
          fill="none"
          strokeLinecap="butt"
          strokeLinejoin="round"
        />
        <circle
          cx={formatSvgNumber(model.chartEnd.x)}
          cy={formatSvgNumber(model.chartEnd.y)}
          r={4}
          fill="#e11d48"
        />
      </svg>

      {textLinesElements(model.bodyLines, "body", 86, bodyTop, 34, {
        color: colors.body,
        fontSize: 28,
        fontWeight: 400,
        lineHeight: "34px",
      })}

      <div
        style={{
          position: "absolute",
          left: 812,
          top: 132,
          width: 2,
          height: 378,
          background: colors.line,
        }}
      />

      <MetricBlock
        colors={colors}
        label="Breach probability"
        value={model.breachProbability}
        y={150}
      />
      <div
        style={{
          position: "absolute",
          left: 862,
          top: 258,
          width: 226,
          height: 2,
          background: colors.line,
        }}
      />
      <MetricBlock colors={colors} label="Expected time" value={model.expectedTime} y={284} />
      <div
        style={{
          position: "absolute",
          left: 862,
          top: 392,
          width: 226,
          height: 2,
          background: colors.line,
        }}
      />
      <MetricBlock colors={colors} label="Modeled packages" value={model.modeledPackages} y={418} />
    </div>
  );
}
