/* eslint-disable react-perf/jsx-no-new-object-as-prop -- @vercel/og renders this static tree once per image request. */
import type { CSSProperties, ReactElement, ReactNode } from "react";

import { OG_FONT } from "../server/ogFonts";
import {
  buildOgImageModel,
  OG_CURVE,
  OG_LAYOUT,
  type OgColors,
  type OgCurveView,
  type OgFieldView,
  type OgLedgerRow,
  type OgVerdict,
} from "./ogImage";

/** Condensed uppercase register: the label scaffolding of the whole card. */
function labelStyle(size: number, color: string): CSSProperties {
  return {
    display: "flex",
    fontFamily: OG_FONT.label,
    fontWeight: 600,
    fontSize: size,
    letterSpacing: size * OG_LAYOUT.labelTracking,
    textTransform: "uppercase",
    whiteSpace: "nowrap",
    color,
  };
}

/** Every numeric figure and package ref is set in mono, as on the page. */
function figureStyle(size: number, color: string): CSSProperties {
  return {
    display: "flex",
    fontFamily: OG_FONT.mono,
    fontWeight: 600,
    fontSize: size,
    whiteSpace: "nowrap",
    color,
  };
}

function Rule({
  color,
  top,
  left = OG_LAYOUT.padX,
  width = OG_LAYOUT.contentWidth,
  height = 1,
}: {
  color: string;
  top: number;
  left?: number;
  width?: number;
  height?: number;
}): ReactElement {
  return <div style={{ position: "absolute", left, top, width, height, background: color }} />;
}

function Swatch({ color, size = 10 }: { color: string; size?: number }): ReactElement {
  return <div style={{ display: "flex", width: size, height: size, background: color }} />;
}

function LegendEntry({
  colors,
  label,
  swatch,
  value,
}: {
  colors: OgColors;
  label: string;
  swatch: string;
  value: string;
}): ReactElement {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
      <Swatch color={swatch} />
      <div style={labelStyle(OG_LAYOUT.legendLabelSize, colors.muted)}>{label}</div>
      <div style={figureStyle(OG_LAYOUT.legendValueSize, colors.ink)}>{value}</div>
    </div>
  );
}

/**
 * The verdict is pre-broken into lines by the model, so each line is its own
 * absolutely positioned row of runs. The word gap is a flex gap, which lets a
 * run switch to mono or to the severity colour without disturbing the rhythm.
 */
function verdictLines(accent: string, colors: OgColors, verdict: OgVerdict): ReactElement[] {
  const top = OG_LAYOUT.verdictBottom - verdict.lines.length * verdict.lineHeight;

  return verdict.lines.map((line, index) => (
    <div
      key={line.map((segment) => segment.text).join(" ")}
      style={{
        position: "absolute",
        left: OG_LAYOUT.padX,
        top: top + index * verdict.lineHeight,
        display: "flex",
        alignItems: "baseline",
        gap: verdict.gap,
        height: verdict.lineHeight,
      }}
    >
      {line.map((segment) => (
        <div
          key={segment.text}
          style={{
            display: "flex",
            fontFamily: segment.mono ? OG_FONT.mono : OG_FONT.statement,
            fontWeight: segment.mono ? 600 : 700,
            fontSize: verdict.fontSize,
            lineHeight: `${verdict.lineHeight}px`,
            letterSpacing: verdict.fontSize * -0.021,
            whiteSpace: "nowrap",
            color: segment.accent ? accent : colors.ink,
          }}
        >
          {segment.text}
        </div>
      ))}
    </div>
  ));
}

function PackageField({ colors, field }: { colors: OgColors; field: OgFieldView }): ReactElement {
  return (
    <svg
      width={field.width}
      height={field.height}
      viewBox={field.viewBox}
      style={{ position: "absolute", left: OG_LAYOUT.padX, top: OG_LAYOUT.fieldTop }}
    >
      <path d={field.transitivePath} fill={colors.inkFaint} />
      <path d={field.directPath} fill={colors.seriesB} />
      <path d={field.selfPath} fill={colors.ink} />
    </svg>
  );
}

/**
 * Cumulative breach probability over the horizon, on a fixed 0-100% axis. Only
 * paths go inside the SVG: axis and end labels are positioned divs, so they use
 * the registered families rather than whatever SVG text would resolve to.
 *
 * Satori positions an absolute child against its parent box, so the whole chart
 * is laid out in coordinates local to this container.
 */
function RiskCurve({ colors, curve }: { colors: OgColors; curve: OgCurveView }): ReactElement {
  const { plot } = curve;
  const axisLabel = figureStyle(OG_CURVE.axisLabelSize, colors.muted);

  return (
    <div
      style={{
        position: "absolute",
        left: OG_CURVE.left,
        top: OG_CURVE.top,
        width: OG_CURVE.width,
        height: OG_CURVE.height,
        display: "flex",
      }}
    >
      <svg
        width={OG_CURVE.width}
        height={OG_CURVE.height}
        viewBox={`0 0 ${OG_CURVE.width} ${OG_CURVE.height}`}
        style={{ position: "absolute", left: 0, top: 0 }}
      >
        <path d={curve.gridPath} fill="none" stroke={colors.rule} strokeWidth={1} />
        <path d={curve.areaPath} fill={colors.seriesAWash} />
        <path
          d={curve.linePath}
          fill="none"
          stroke={colors.seriesA}
          strokeWidth={OG_CURVE.strokeWidth}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {/* Overshooting the plot by half a label box lands each label on its hairline. */}
      <div
        style={{
          position: "absolute",
          left: 0,
          top: plot.top - OG_CURVE.axisLabelBox / 2,
          width: plot.left - OG_CURVE.axisLabelGap,
          height: plot.height + OG_CURVE.axisLabelBox,
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          justifyContent: "space-between",
        }}
      >
        {curve.yLabels.map((label) => (
          <div
            key={label}
            style={{
              ...axisLabel,
              alignItems: "center",
              height: OG_CURVE.axisLabelBox,
            }}
          >
            {label}
          </div>
        ))}
      </div>

      <div
        style={{
          position: "absolute",
          left: plot.left,
          top: plot.top + plot.height + OG_CURVE.axisLabelGap,
          width: plot.width,
          display: "flex",
          justifyContent: "space-between",
        }}
      >
        {curve.xLabels.map((label) => (
          <div key={label} style={axisLabel}>
            {label}
          </div>
        ))}
      </div>

      {/* The line is labelled where it ends, so the eye never leaves the chart. */}
      <div
        style={{
          position: "absolute",
          left: plot.left + plot.width + OG_CURVE.endLabelGap,
          top: curve.endLabelTop,
          height: OG_CURVE.endLabelBox,
          alignItems: "center",
          ...figureStyle(OG_CURVE.endLabelSize, colors.seriesA),
        }}
      >
        {curve.endLabel}
      </div>
    </div>
  );
}

function Ledger({ colors, rows }: { colors: OgColors; rows: OgLedgerRow[] }): ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        left: OG_LAYOUT.ledgerLeft,
        top: OG_LAYOUT.ledgerTop,
        width: OG_LAYOUT.ledgerWidth,
        display: "flex",
        flexDirection: "column",
      }}
    >
      {rows.map((row) => (
        <div
          key={row.label}
          style={{
            display: "flex",
            alignItems: "baseline",
            justifyContent: "space-between",
            gap: 16,
            height: OG_LAYOUT.ledgerRowHeight,
            paddingTop: 12,
            borderBottom: `1px solid ${colors.rule}`,
          }}
        >
          <div
            style={{
              ...labelStyle(OG_LAYOUT.ledgerLabelSize, colors.muted),
              // The figure is the point of the row, so the label is what gives
              // way if a value ever runs long.
              flexShrink: 1,
              overflow: "hidden",
            }}
          >
            {row.label}
          </div>
          <div style={figureStyle(OG_LAYOUT.ledgerValueSize, row.color ?? colors.ink)}>
            {row.value}
          </div>
        </div>
      ))}
    </div>
  );
}

function Absolute({
  children,
  left = OG_LAYOUT.padX,
  top,
  gap,
  maxWidth,
}: {
  children: ReactNode;
  left?: number;
  top: number;
  gap: number;
  maxWidth?: number;
}): ReactElement {
  return (
    <div
      style={{
        position: "absolute",
        left,
        top,
        display: "flex",
        alignItems: "center",
        gap,
        // Satori reads the style object directly, and chokes on `undefined`.
        ...(maxWidth === undefined ? {} : { maxWidth }),
        // Pathological dependency counts clip at the column edge rather than
        // running into whatever sits to the right.
        overflow: "hidden",
      }}
    >
      {children}
    </div>
  );
}

export function renderOgImage(url: URL): ReactElement {
  const model = buildOgImageModel(url);
  const { colors, field } = model;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        position: "relative",
        background: colors.paper,
        color: colors.ink,
        fontFamily: OG_FONT.statement,
      }}
    >
      <div
        style={{
          position: "absolute",
          left: OG_LAYOUT.padX,
          top: OG_LAYOUT.wordmarkTop,
          ...figureStyle(OG_LAYOUT.wordmarkSize, colors.ink),
          letterSpacing: -0.9,
        }}
      >
        npm.tax
      </div>

      {model.severity ? (
        <div
          style={{
            position: "absolute",
            right: OG_LAYOUT.padX,
            top: OG_LAYOUT.chipTop,
            display: "flex",
            alignItems: "center",
            gap: 9,
            padding: "7px 12px 8px",
            border: `2px solid ${model.severity.color}`,
            ...labelStyle(OG_LAYOUT.chipSize, model.severity.color),
          }}
        >
          <Swatch color={model.severity.color} size={9} />
          {model.severity.label}
        </div>
      ) : null}

      <Rule color={colors.ink} top={OG_LAYOUT.headRuleTop} height={2} />

      <Absolute top={OG_LAYOUT.eyebrowTop} gap={14}>
        <div style={labelStyle(OG_LAYOUT.eyebrowSize, colors.muted)}>{model.eyebrow}</div>
        {model.eyebrowRef ? (
          <div style={figureStyle(OG_LAYOUT.eyebrowRefSize, colors.ink)}>{model.eyebrowRef}</div>
        ) : null}
      </Absolute>

      {verdictLines(model.accent, colors, model.verdict)}

      <Rule color={colors.rule} top={OG_LAYOUT.sectionRuleTop} />

      <Absolute
        top={OG_LAYOUT.legendTop}
        gap={OG_LAYOUT.legendGap}
        maxWidth={OG_LAYOUT.legendMaxWidth}
      >
        {model.fieldLabel !== undefined && (
          <div style={labelStyle(OG_LAYOUT.legendLabelSize, colors.muted)}>{model.fieldLabel}</div>
        )}
        <LegendEntry colors={colors} label="Self" swatch={colors.ink} value={field.selfValue} />
        <LegendEntry
          colors={colors}
          label="Direct deps"
          swatch={colors.seriesB}
          value={field.directValue}
        />
        <LegendEntry
          colors={colors}
          label="Transitive deps"
          swatch={colors.inkFaint}
          value={field.transitiveValue}
        />
      </Absolute>

      <PackageField colors={colors} field={field} />

      <div
        style={{
          position: "absolute",
          left: OG_LAYOUT.padX,
          top: OG_LAYOUT.curveLabelTop,
          ...labelStyle(OG_LAYOUT.curveLabelSize, colors.muted),
        }}
      >
        Cumulative breach probability
      </div>

      <RiskCurve colors={colors} curve={model.curve} />

      <Ledger colors={colors} rows={model.ledger} />
    </div>
  );
}
