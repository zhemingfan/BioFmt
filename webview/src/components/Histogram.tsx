// SPDX-License-Identifier: GPL-3.0-or-later

import { useRef, useEffect } from 'react';

interface HistogramProps {
  data: number[];
  bins?: number;
  label: string;
  width?: number;
  height?: number;
}

export function Histogram({ data, bins = 20, label, width = 300, height = 150 }: HistogramProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || data.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const style = getComputedStyle(document.body);
    const bg = style.getPropertyValue('--vscode-editor-background') || '#1e1e1e';
    const fg = style.getPropertyValue('--vscode-foreground') || '#ccc';
    const barColor = style.getPropertyValue('--vscode-charts-blue') || '#4ec9b0';
    const border = style.getPropertyValue('--vscode-panel-border') || '#333';

    const padding = { top: 10, right: 10, bottom: 30, left: 50 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    // Compute histogram bins (loop avoids stack overflow from spread on large arrays)
    let min = Infinity, max = -Infinity;
    for (let i = 0; i < data.length; i++) {
      if (data[i] < min) min = data[i];
      if (data[i] > max) max = data[i];
    }
    const range = max - min || 1;
    const binWidth = range / bins;
    const counts = new Array(bins).fill(0);

    for (const v of data) {
      const idx = Math.min(Math.floor((v - min) / binWidth), bins - 1);
      counts[idx]++;
    }

    const maxCount = Math.max(...counts);

    // Clear
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Draw bars
    const barW = plotW / bins;
    ctx.fillStyle = barColor;
    ctx.globalAlpha = 0.8;
    for (let i = 0; i < bins; i++) {
      const barH = maxCount > 0 ? (counts[i] / maxCount) * plotH : 0;
      ctx.fillRect(
        padding.left + i * barW + 1,
        padding.top + plotH - barH,
        barW - 2,
        barH
      );
    }
    ctx.globalAlpha = 1;

    // Y-axis labels
    ctx.fillStyle = fg;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= 3; i++) {
      const val = Math.round((maxCount / 3) * (3 - i));
      const y = padding.top + (i / 3) * plotH;
      ctx.fillText(String(val), padding.left - 5, y);
    }

    // X-axis labels (min, mid, max)
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const xLabels = [min, min + range / 2, max];
    const xPositions = [padding.left, padding.left + plotW / 2, padding.left + plotW];
    for (let i = 0; i < 3; i++) {
      ctx.fillText(formatNumber(xLabels[i]), xPositions[i], padding.top + plotH + 4);
    }

    // Axes
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + plotH);
    ctx.lineTo(padding.left + plotW, padding.top + plotH);
    ctx.stroke();
  }, [data, bins, width, height]);

  if (data.length === 0) return null;

  return (
    <div className="stats-chart">
      <div className="stats-chart-label">{label}</div>
      <canvas ref={canvasRef} width={width} height={height} />
    </div>
  );
}

function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString();
  if (Math.abs(n) >= 1000) return Math.round(n).toLocaleString();
  return n.toPrecision(3);
}
