// SPDX-License-Identifier: GPL-3.0-or-later

import { useRef, useEffect } from 'react';

interface BarChartEntry {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarChartEntry[];
  label: string;
  width?: number;
  height?: number;
}

export function BarChart({ data, label, width = 300, height = 150 }: BarChartProps) {
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

    // Horizontal bar chart for better label readability
    const padding = { top: 10, right: 10, bottom: 10, left: 80 };
    const plotW = width - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    const maxValue = Math.max(...data.map(d => d.value));
    const barH = Math.min(20, plotH / data.length - 2);

    // Clear
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    // Draw bars
    ctx.fillStyle = barColor;
    ctx.globalAlpha = 0.8;
    for (let i = 0; i < data.length; i++) {
      const barW = maxValue > 0 ? (data[i].value / maxValue) * plotW : 0;
      const y = padding.top + i * (barH + 2);
      ctx.fillRect(padding.left, y, barW, barH);
    }
    ctx.globalAlpha = 1;

    // Labels
    ctx.fillStyle = fg;
    ctx.font = '10px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < data.length; i++) {
      const y = padding.top + i * (barH + 2) + barH / 2;
      const truncLabel = data[i].label.length > 10 ? data[i].label.substring(0, 10) + '\u2026' : data[i].label;
      ctx.fillText(truncLabel, padding.left - 5, y);
    }

    // Values at end of bars
    ctx.textAlign = 'left';
    for (let i = 0; i < data.length; i++) {
      const barW = maxValue > 0 ? (data[i].value / maxValue) * plotW : 0;
      const y = padding.top + i * (barH + 2) + barH / 2;
      ctx.fillText(data[i].value.toLocaleString(), padding.left + barW + 4, y);
    }

    // Left axis
    ctx.strokeStyle = border;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, padding.top + plotH);
    ctx.stroke();
  }, [data, width, height]);

  if (data.length === 0) return null;

  return (
    <div className="stats-chart">
      <div className="stats-chart-label">{label}</div>
      <canvas ref={canvasRef} width={width} height={height} />
    </div>
  );
}
