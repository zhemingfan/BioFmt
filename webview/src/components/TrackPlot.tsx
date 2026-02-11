// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import type { DocumentMetadata } from '../types';

interface TrackPlotProps {
  metadata: DocumentMetadata;
  rows: string[];
  loadedLineCount: number;
  onRequestRows: (startLine: number, endLine: number) => void;
}

interface DataPoint {
  chrom: string;
  position: number;
  value: number;
}

interface Track {
  id: string;
  name: string;
  chrom: string;
  points: DataPoint[];
  minValue: number;
  maxValue: number;
}

const MAX_TRACKS = 10;
const MAX_POINTS_DISPLAY = 200000;
const DOWNSAMPLE_THRESHOLD = 5000;

function parseWig(rows: string[]): Track[] {
  const tracks: Track[] = [];
  let currentTrack: Track | null = null;
  let currentSpan = 1;
  let currentStep = 0;
  let currentStart = 0;
  let currentChrom = '';
  let isFixedStep = false;

  for (const line of rows) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Track definition line
    if (trimmed.startsWith('track')) {
      if (currentTrack && currentTrack.points.length > 0) {
        tracks.push(currentTrack);
      }
      const nameMatch = trimmed.match(/name=["']?([^"'\s]+)["']?/);
      const trackName = nameMatch ? nameMatch[1] : `Track ${tracks.length + 1}`;
      currentTrack = {
        id: `track-${tracks.length}`,
        name: trackName,
        chrom: '',
        points: [],
        minValue: Infinity,
        maxValue: -Infinity,
      };
      continue;
    }

    // Declaration lines
    if (trimmed.startsWith('variableStep') || trimmed.startsWith('fixedStep')) {
      isFixedStep = trimmed.startsWith('fixedStep');

      const chromMatch = trimmed.match(/chrom=(\S+)/);
      const spanMatch = trimmed.match(/span=(\d+)/);
      const startMatch = trimmed.match(/start=(\d+)/);
      const stepMatch = trimmed.match(/step=(\d+)/);

      if (chromMatch) {
        currentChrom = chromMatch[1];
        if (currentTrack) {
          currentTrack.chrom = currentChrom;
        }
      }
      currentSpan = spanMatch ? parseInt(spanMatch[1], 10) : 1;
      currentStart = startMatch ? parseInt(startMatch[1], 10) : 0;
      currentStep = stepMatch ? parseInt(stepMatch[1], 10) : 0;

      // Create new track for each chrom section if we don't have one
      if (!currentTrack) {
        currentTrack = {
          id: `track-${tracks.length}`,
          name: `Track ${tracks.length + 1}`,
          chrom: currentChrom,
          points: [],
          minValue: Infinity,
          maxValue: -Infinity,
        };
      }
      continue;
    }

    // Data lines
    if (currentTrack) {
      const parts = trimmed.split(/\s+/);

      if (isFixedStep && parts.length === 1) {
        // fixedStep: just value
        const value = parseFloat(parts[0]);
        if (!isNaN(value)) {
          currentTrack.points.push({
            chrom: currentChrom,
            position: currentStart,
            value,
          });
          currentTrack.minValue = Math.min(currentTrack.minValue, value);
          currentTrack.maxValue = Math.max(currentTrack.maxValue, value);
          currentStart += currentStep;
        }
      } else if (!isFixedStep && parts.length >= 2) {
        // variableStep: position value
        const position = parseInt(parts[0], 10);
        const value = parseFloat(parts[1]);
        if (!isNaN(position) && !isNaN(value)) {
          currentTrack.points.push({
            chrom: currentChrom,
            position,
            value,
          });
          currentTrack.minValue = Math.min(currentTrack.minValue, value);
          currentTrack.maxValue = Math.max(currentTrack.maxValue, value);
        }
      }

      // Safety limit
      if (currentTrack.points.length >= MAX_POINTS_DISPLAY) {
        break;
      }
    }
  }

  // Push last track
  if (currentTrack && currentTrack.points.length > 0) {
    tracks.push(currentTrack);
  }

  return tracks.slice(0, MAX_TRACKS);
}

function parseBedGraph(rows: string[]): Track[] {
  const tracks: Track[] = [];
  let currentTrack: Track = {
    id: 'bedgraph-0',
    name: 'bedGraph',
    chrom: '',
    points: [],
    minValue: Infinity,
    maxValue: -Infinity,
  };

  for (const line of rows) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Track definition line
    if (trimmed.startsWith('track')) {
      if (currentTrack.points.length > 0) {
        tracks.push(currentTrack);
      }
      const nameMatch = trimmed.match(/name=["']?([^"'\s]+)["']?/);
      const trackName = nameMatch ? nameMatch[1] : `Track ${tracks.length + 1}`;
      currentTrack = {
        id: `bedgraph-${tracks.length}`,
        name: trackName,
        chrom: '',
        points: [],
        minValue: Infinity,
        maxValue: -Infinity,
      };
      continue;
    }

    if (trimmed.startsWith('browser')) continue;

    // Data lines: chrom start end value
    const parts = trimmed.split('\t');
    if (parts.length >= 4) {
      const chrom = parts[0];
      const start = parseInt(parts[1], 10);
      const end = parseInt(parts[2], 10);
      const value = parseFloat(parts[3]);

      if (!isNaN(start) && !isNaN(end) && !isNaN(value)) {
        const midpoint = Math.floor((start + end) / 2);
        currentTrack.chrom = chrom;
        currentTrack.points.push({
          chrom,
          position: midpoint,
          value,
        });
        currentTrack.minValue = Math.min(currentTrack.minValue, value);
        currentTrack.maxValue = Math.max(currentTrack.maxValue, value);
      }

      // Safety limit
      if (currentTrack.points.length >= MAX_POINTS_DISPLAY) {
        break;
      }
    }
  }

  if (currentTrack.points.length > 0) {
    tracks.push(currentTrack);
  }

  return tracks.slice(0, MAX_TRACKS);
}

function downsample(points: DataPoint[], targetCount: number): DataPoint[] {
  if (points.length <= targetCount) return points;

  const binSize = Math.ceil(points.length / targetCount);
  const result: DataPoint[] = [];

  for (let i = 0; i < points.length; i += binSize) {
    const binEnd = Math.min(i + binSize, points.length);
    let sum = 0;
    let minPos = Infinity;
    let maxPos = -Infinity;

    for (let j = i; j < binEnd; j++) {
      sum += points[j].value;
      minPos = Math.min(minPos, points[j].position);
      maxPos = Math.max(maxPos, points[j].position);
    }

    result.push({
      chrom: points[i].chrom,
      position: Math.floor((minPos + maxPos) / 2),
      value: sum / (binEnd - i),
    });
  }

  return result;
}

export function TrackPlot({ metadata, rows, loadedLineCount, onRequestRows }: TrackPlotProps) {
  const [selectedTrack, setSelectedTrack] = useState<string>('');
  const [zoomLevel, setZoomLevel] = useState(1);
  const [panOffset, setPanOffset] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const isWig = metadata.languageId === 'omics-wig';
  const formatLabel = isWig ? 'WIG' : 'bedGraph';

  // Parse tracks
  const tracks = useMemo(() => {
    return isWig ? parseWig(rows) : parseBedGraph(rows);
  }, [rows, isWig]);

  // Set default selected track
  useEffect(() => {
    if (tracks.length > 0 && !selectedTrack) {
      setSelectedTrack(tracks[0].id);
    }
  }, [tracks, selectedTrack]);

  // Get current track
  const currentTrack = useMemo(() => {
    return tracks.find(t => t.id === selectedTrack) || tracks[0];
  }, [tracks, selectedTrack]);

  // Downsample points for display
  const displayPoints = useMemo(() => {
    if (!currentTrack) return [];
    return currentTrack.points.length > DOWNSAMPLE_THRESHOLD
      ? downsample(currentTrack.points, DOWNSAMPLE_THRESHOLD)
      : currentTrack.points;
  }, [currentTrack]);

  // Draw the plot
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentTrack || displayPoints.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = { top: 20, right: 20, bottom: 40, left: 60 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    // Clear canvas
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--vscode-editor-background') || '#1e1e1e';
    ctx.fillRect(0, 0, width, height);

    // Get data range with zoom and pan
    const allPositions = displayPoints.map(p => p.position);
    const fullMinX = Math.min(...allPositions);
    const fullMaxX = Math.max(...allPositions);
    const fullRange = fullMaxX - fullMinX;

    const viewRange = fullRange / zoomLevel;
    const minX = fullMinX + panOffset * fullRange;
    const maxX = minX + viewRange;

    const minY = currentTrack.minValue;
    const maxY = currentTrack.maxValue;
    const rangeY = maxY - minY || 1;

    // Filter points in view
    const visiblePoints = displayPoints.filter(p => p.position >= minX && p.position <= maxX);

    // Scale functions
    const scaleX = (x: number) => padding.left + ((x - minX) / (maxX - minX)) * plotWidth;
    const scaleY = (y: number) => padding.top + plotHeight - ((y - minY) / rangeY) * plotHeight;

    // Draw grid
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--vscode-panel-border') || '#333';
    ctx.lineWidth = 1;

    // Y-axis grid lines
    const numYLines = 5;
    for (let i = 0; i <= numYLines; i++) {
      const y = padding.top + (i / numYLines) * plotHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    // Draw Y-axis labels
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--vscode-foreground') || '#ccc';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= numYLines; i++) {
      const value = maxY - (i / numYLines) * rangeY;
      const y = padding.top + (i / numYLines) * plotHeight;
      ctx.fillText(value.toFixed(2), padding.left - 8, y);
    }

    // Draw X-axis labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const numXLabels = 5;
    for (let i = 0; i <= numXLabels; i++) {
      const pos = minX + (i / numXLabels) * (maxX - minX);
      const x = padding.left + (i / numXLabels) * plotWidth;
      ctx.fillText(formatPosition(pos), x, height - padding.bottom + 8);
    }

    // Draw line plot
    if (visiblePoints.length > 0) {
      ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--vscode-charts-blue') || '#4ec9b0';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(scaleX(visiblePoints[0].position), scaleY(visiblePoints[0].value));

      for (let i = 1; i < visiblePoints.length; i++) {
        ctx.lineTo(scaleX(visiblePoints[i].position), scaleY(visiblePoints[i].value));
      }
      ctx.stroke();

      // Fill under the line
      ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--vscode-charts-blue') || '#4ec9b0';
      ctx.globalAlpha = 0.2;
      ctx.beginPath();
      ctx.moveTo(scaleX(visiblePoints[0].position), scaleY(visiblePoints[0].value));
      for (let i = 1; i < visiblePoints.length; i++) {
        ctx.lineTo(scaleX(visiblePoints[i].position), scaleY(visiblePoints[i].value));
      }
      ctx.lineTo(scaleX(visiblePoints[visiblePoints.length - 1].position), padding.top + plotHeight);
      ctx.lineTo(scaleX(visiblePoints[0].position), padding.top + plotHeight);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // Draw axes
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--vscode-foreground') || '#ccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

  }, [currentTrack, displayPoints, zoomLevel, panOffset]);

  // Zoom handlers
  const handleZoomIn = useCallback(() => {
    setZoomLevel(prev => Math.min(prev * 1.5, 100));
  }, []);

  const handleZoomOut = useCallback(() => {
    setZoomLevel(prev => Math.max(prev / 1.5, 1));
    if (zoomLevel <= 1) {
      setPanOffset(0);
    }
  }, [zoomLevel]);

  const handleResetZoom = useCallback(() => {
    setZoomLevel(1);
    setPanOffset(0);
  }, []);

  // Pan handlers
  const handlePanLeft = useCallback(() => {
    setPanOffset(prev => Math.max(prev - 0.1 / zoomLevel, 0));
  }, [zoomLevel]);

  const handlePanRight = useCallback(() => {
    setPanOffset(prev => Math.min(prev + 0.1 / zoomLevel, 1 - 1 / zoomLevel));
  }, [zoomLevel]);

  // Load more data functionality
  const [loadingMore, setLoadingMore] = useState(false);
  const isTruncated = loadedLineCount < metadata.lineCount;

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && isTruncated) {
      setLoadingMore(true);
      onRequestRows(loadedLineCount, Math.min(loadedLineCount + 10000, metadata.lineCount));
    }
  }, [loadingMore, isTruncated, loadedLineCount, metadata.lineCount, onRequestRows]);

  useEffect(() => {
    setLoadingMore(false);
  }, [rows.length]);

  const totalPoints = currentTrack?.points.length || 0;
  const isDownsampled = totalPoints > DOWNSAMPLE_THRESHOLD;

  return (
    <div className="track-plot-preview">
      {/* Header */}
      <div className="preview-header">
        <h1>{metadata.fileName}</h1>
        <div className="meta">
          <span>Format: {formatLabel}</span>
          <span>Lines: {metadata.lineCount.toLocaleString()}</span>
          <span>Tracks: {tracks.length}</span>
          {currentTrack && (
            <>
              <span>Points: {totalPoints.toLocaleString()}</span>
              <span>Chrom: {currentTrack.chrom}</span>
            </>
          )}
        </div>
      </div>

      {/* Truncation warning */}
      {isTruncated && (
        <div className="truncation-warning">
          Showing {loadedLineCount.toLocaleString()} of {metadata.lineCount.toLocaleString()} lines.
          <button onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading...' : 'Load More Data'}
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="filter-bar">
        {tracks.length > 1 && (
          <label>
            Track:
            <select
              value={selectedTrack}
              onChange={(e) => setSelectedTrack(e.target.value)}
            >
              {tracks.map(track => (
                <option key={track.id} value={track.id}>
                  {track.name} ({track.points.length.toLocaleString()} points)
                </option>
              ))}
            </select>
          </label>
        )}

        <div className="zoom-controls">
          <button onClick={handlePanLeft} disabled={panOffset <= 0}>◀</button>
          <button onClick={handleZoomOut} disabled={zoomLevel <= 1}>−</button>
          <span className="zoom-level">{zoomLevel.toFixed(1)}x</span>
          <button onClick={handleZoomIn} disabled={zoomLevel >= 100}>+</button>
          <button onClick={handlePanRight} disabled={zoomLevel <= 1 || panOffset >= 1 - 1/zoomLevel}>▶</button>
          <button onClick={handleResetZoom} disabled={zoomLevel === 1}>Reset</button>
        </div>

        {isDownsampled && (
          <span className="filter-info">
            Displaying downsampled data ({DOWNSAMPLE_THRESHOLD.toLocaleString()} points)
          </span>
        )}
      </div>

      {/* Canvas plot */}
      <div className="plot-container">
        <canvas
          ref={canvasRef}
          width={900}
          height={400}
          className="track-canvas"
        />
      </div>

      {/* Stats */}
      {currentTrack && (
        <div className="track-stats">
          <div className="stat-item">
            <span className="stat-label">Min value:</span>
            <span className="stat-value">{currentTrack.minValue.toFixed(4)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Max value:</span>
            <span className="stat-value">{currentTrack.maxValue.toFixed(4)}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Range:</span>
            <span className="stat-value">{(currentTrack.maxValue - currentTrack.minValue).toFixed(4)}</span>
          </div>
        </div>
      )}
    </div>
  );
}

function formatPosition(pos: number): string {
  if (pos >= 1e9) return (pos / 1e9).toFixed(2) + 'G';
  if (pos >= 1e6) return (pos / 1e6).toFixed(2) + 'M';
  if (pos >= 1e3) return (pos / 1e3).toFixed(2) + 'K';
  return pos.toFixed(0);
}
