// SPDX-License-Identifier: GPL-3.0-or-later

import React, { useCallback, useMemo, useState, useRef, useEffect } from 'react';
import type { DocumentMetadata } from '../types';

interface MgfPreviewProps {
  metadata: DocumentMetadata;
  rows: string[];
  loadedLineCount: number;
  onRequestRows: (startLine: number, endLine: number) => void;
}

interface Spectrum {
  index: number;
  title: string;
  pepMass?: number;
  charge?: string;
  rtInSeconds?: number;
  peaks: { mz: number; intensity: number }[];
  startLine: number;
  headers: Record<string, string>;
}

function parseSpectra(rows: string[]): Spectrum[] {
  const spectra: Spectrum[] = [];
  let currentSpectrum: Spectrum | null = null;
  let inPeaks = false;
  let spectrumIndex = 0;

  for (let i = 0; i < rows.length; i++) {
    const line = rows[i];
    const trimmed = line.trim();

    if (!trimmed) continue;

    if (trimmed === 'BEGIN IONS') {
      currentSpectrum = {
        index: spectrumIndex++,
        title: `Spectrum ${spectrumIndex}`,
        peaks: [],
        startLine: i,
        headers: {},
      };
      inPeaks = false;
      continue;
    }

    if (trimmed === 'END IONS') {
      if (currentSpectrum) {
        spectra.push(currentSpectrum);
        currentSpectrum = null;
      }
      inPeaks = false;
      continue;
    }

    if (currentSpectrum) {
      // Header line (key=value)
      if (trimmed.includes('=') && !inPeaks) {
        const [key, ...valueParts] = trimmed.split('=');
        const value = valueParts.join('=');

        currentSpectrum.headers[key] = value;

        switch (key.toUpperCase()) {
          case 'TITLE':
            currentSpectrum.title = value;
            break;
          case 'PEPMASS':
            currentSpectrum.pepMass = parseFloat(value.split(/\s+/)[0]);
            break;
          case 'CHARGE':
            currentSpectrum.charge = value;
            break;
          case 'RTINSECONDS':
            currentSpectrum.rtInSeconds = parseFloat(value);
            break;
        }
        continue;
      }

      // Peak data (m/z intensity)
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 2) {
        const mz = parseFloat(parts[0]);
        const intensity = parseFloat(parts[1]);
        if (!isNaN(mz) && !isNaN(intensity)) {
          inPeaks = true;
          currentSpectrum.peaks.push({ mz, intensity });
        }
      }
    }
  }

  return spectra;
}

export function MgfPreview({ metadata, rows, loadedLineCount, onRequestRows }: MgfPreviewProps) {
  const [currentSpectrumIndex, setCurrentSpectrumIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Parse spectra
  const spectra = useMemo(() => parseSpectra(rows), [rows]);

  // Filter spectra
  const filteredSpectra = useMemo(() => {
    if (!searchTerm) return spectra;
    const term = searchTerm.toLowerCase();
    return spectra.filter(s =>
      s.title.toLowerCase().includes(term) ||
      Object.values(s.headers).some(v => v.toLowerCase().includes(term))
    );
  }, [spectra, searchTerm]);

  const currentSpectrum = filteredSpectra[currentSpectrumIndex] || null;

  // Draw spectrum plot
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !currentSpectrum || currentSpectrum.peaks.length === 0) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const padding = { top: 20, right: 20, bottom: 50, left: 70 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;

    // Clear canvas
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--vscode-editor-background') || '#1e1e1e';
    ctx.fillRect(0, 0, width, height);

    const peaks = currentSpectrum.peaks;
    const minMz = Math.min(...peaks.map(p => p.mz));
    const maxMz = Math.max(...peaks.map(p => p.mz));
    const maxIntensity = Math.max(...peaks.map(p => p.intensity));

    const rangeMz = maxMz - minMz || 1;

    // Scale functions
    const scaleX = (mz: number) => padding.left + ((mz - minMz) / rangeMz) * plotWidth;
    const scaleY = (intensity: number) => padding.top + plotHeight - (intensity / maxIntensity) * plotHeight;

    // Draw grid
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--vscode-panel-border') || '#333';
    ctx.lineWidth = 0.5;

    // Y-axis grid
    const numYLines = 5;
    for (let i = 0; i <= numYLines; i++) {
      const y = padding.top + (i / numYLines) * plotHeight;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    // X-axis grid
    const numXLines = 10;
    for (let i = 0; i <= numXLines; i++) {
      const x = padding.left + (i / numXLines) * plotWidth;
      ctx.beginPath();
      ctx.moveTo(x, padding.top);
      ctx.lineTo(x, height - padding.bottom);
      ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--vscode-foreground') || '#ccc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(padding.left, padding.top);
    ctx.lineTo(padding.left, height - padding.bottom);
    ctx.lineTo(width - padding.right, height - padding.bottom);
    ctx.stroke();

    // Draw Y-axis labels
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--vscode-foreground') || '#ccc';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';
    for (let i = 0; i <= numYLines; i++) {
      const intensity = maxIntensity * (1 - i / numYLines);
      const y = padding.top + (i / numYLines) * plotHeight;
      ctx.fillText(formatIntensity(intensity), padding.left - 8, y);
    }

    // Draw X-axis labels
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    for (let i = 0; i <= numXLines; i++) {
      const mz = minMz + (i / numXLines) * rangeMz;
      const x = padding.left + (i / numXLines) * plotWidth;
      ctx.fillText(mz.toFixed(1), x, height - padding.bottom + 8);
    }

    // Axis labels
    ctx.font = '12px sans-serif';
    ctx.save();
    ctx.translate(15, height / 2);
    ctx.rotate(-Math.PI / 2);
    ctx.textAlign = 'center';
    ctx.fillText('Intensity', 0, 0);
    ctx.restore();

    ctx.textAlign = 'center';
    ctx.fillText('m/z', width / 2, height - 10);

    // Draw peaks as sticks
    ctx.strokeStyle = getComputedStyle(document.body).getPropertyValue('--vscode-charts-blue') || '#4ec9b0';
    ctx.lineWidth = 1;

    for (const peak of peaks) {
      const x = scaleX(peak.mz);
      const y = scaleY(peak.intensity);
      const baseY = height - padding.bottom;

      ctx.beginPath();
      ctx.moveTo(x, baseY);
      ctx.lineTo(x, y);
      ctx.stroke();
    }

    // Draw peak tops
    ctx.fillStyle = getComputedStyle(document.body).getPropertyValue('--vscode-charts-blue') || '#4ec9b0';
    for (const peak of peaks) {
      const x = scaleX(peak.mz);
      const y = scaleY(peak.intensity);
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
    }

  }, [currentSpectrum]);

  // Navigation handlers
  const handlePrev = useCallback(() => {
    setCurrentSpectrumIndex(prev => Math.max(0, prev - 1));
  }, []);

  const handleNext = useCallback(() => {
    setCurrentSpectrumIndex(prev => Math.min(filteredSpectra.length - 1, prev + 1));
  }, [filteredSpectra.length]);

  const handleFirst = useCallback(() => {
    setCurrentSpectrumIndex(0);
  }, []);

  const handleLast = useCallback(() => {
    setCurrentSpectrumIndex(filteredSpectra.length - 1);
  }, [filteredSpectra.length]);

  // Load more data functionality
  const [loadingMore, setLoadingMore] = useState(false);
  const isTruncated = loadedLineCount < metadata.lineCount;

  const handleLoadMore = useCallback(() => {
    if (!loadingMore && isTruncated) {
      setLoadingMore(true);
      onRequestRows(loadedLineCount, Math.min(loadedLineCount + 5000, metadata.lineCount));
    }
  }, [loadingMore, isTruncated, loadedLineCount, metadata.lineCount, onRequestRows]);

  useEffect(() => {
    setLoadingMore(false);
  }, [rows.length]);

  return (
    <div className="mgf-preview">
      {/* Header */}
      <div className="preview-header">
        <h1>{metadata.fileName}</h1>
        <div className="meta">
          <span>Format: MGF</span>
          <span>Lines: {metadata.lineCount.toLocaleString()}</span>
          <span>Spectra: {spectra.length.toLocaleString()}</span>
          {searchTerm && (
            <span>Filtered: {filteredSpectra.length.toLocaleString()}</span>
          )}
        </div>
      </div>

      {/* Truncation warning */}
      {isTruncated && (
        <div className="truncation-warning">
          Showing {loadedLineCount.toLocaleString()} of {metadata.lineCount.toLocaleString()} lines ({spectra.length} spectra loaded).
          <button onClick={handleLoadMore} disabled={loadingMore}>
            {loadingMore ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}

      {/* Controls */}
      <div className="filter-bar">
        <label>
          Search:
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => {
              setSearchTerm(e.target.value);
              setCurrentSpectrumIndex(0);
            }}
            placeholder="Search title or headers..."
          />
        </label>

        <div className="block-navigation">
          <button onClick={handleFirst} disabled={currentSpectrumIndex === 0}>⏮</button>
          <button onClick={handlePrev} disabled={currentSpectrumIndex === 0}>◀</button>
          <span className="block-indicator">
            Spectrum {currentSpectrumIndex + 1} of {filteredSpectra.length}
          </span>
          <button onClick={handleNext} disabled={currentSpectrumIndex >= filteredSpectra.length - 1}>▶</button>
          <button onClick={handleLast} disabled={currentSpectrumIndex >= filteredSpectra.length - 1}>⏭</button>
        </div>
      </div>

      {/* Spectrum display */}
      {currentSpectrum ? (
        <>
          {/* Spectrum info */}
          <div className="spectrum-info">
            <div className="info-item">
              <span className="info-label">Title:</span>
              <span className="info-value">{currentSpectrum.title}</span>
            </div>
            {currentSpectrum.pepMass && (
              <div className="info-item">
                <span className="info-label">PEPMASS:</span>
                <span className="info-value">{currentSpectrum.pepMass.toFixed(4)}</span>
              </div>
            )}
            {currentSpectrum.charge && (
              <div className="info-item">
                <span className="info-label">CHARGE:</span>
                <span className="info-value">{currentSpectrum.charge}</span>
              </div>
            )}
            {currentSpectrum.rtInSeconds && (
              <div className="info-item">
                <span className="info-label">RT:</span>
                <span className="info-value">{(currentSpectrum.rtInSeconds / 60).toFixed(2)} min</span>
              </div>
            )}
            <div className="info-item">
              <span className="info-label">Peaks:</span>
              <span className="info-value">{currentSpectrum.peaks.length}</span>
            </div>
          </div>

          {/* Plot */}
          <div className="plot-container">
            <canvas
              ref={canvasRef}
              width={900}
              height={400}
              className="spectrum-canvas"
            />
          </div>

          {/* Additional headers */}
          {Object.keys(currentSpectrum.headers).length > 4 && (
            <div className="spectrum-headers">
              <div className="headers-title">All Headers</div>
              <div className="headers-grid">
                {Object.entries(currentSpectrum.headers).map(([key, value]) => (
                  <React.Fragment key={key}>
                    <div className="header-key">{key}</div>
                    <div className="header-value">{value}</div>
                  </React.Fragment>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="no-spectra">
          {spectra.length === 0 ? 'No spectra found' : 'No spectra match the search criteria'}
        </div>
      )}
    </div>
  );
}

function formatIntensity(intensity: number): string {
  if (intensity >= 1e6) return (intensity / 1e6).toFixed(1) + 'M';
  if (intensity >= 1e3) return (intensity / 1e3).toFixed(1) + 'K';
  return intensity.toFixed(0);
}
