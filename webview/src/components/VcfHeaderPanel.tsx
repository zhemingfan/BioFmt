// SPDX-License-Identifier: GPL-3.0-or-later

import React from 'react';
import type { VcfHeaderInfo } from '../types';

interface VcfHeaderPanelProps {
  headerInfo: VcfHeaderInfo;
  expanded: boolean;
  onToggle: () => void;
}

export function VcfHeaderPanel({ headerInfo, expanded, onToggle }: VcfHeaderPanelProps) {
  return (
    <div className="header-panel">
      <div className="header-panel-toggle" onClick={onToggle}>
        <span>{expanded ? '▾' : '▸'}</span>
        <span>VCF Header Information</span>
        <span style={{ opacity: 0.6, marginLeft: 8 }}>
          ({headerInfo.infoFields.length} INFO, {headerInfo.formatFields.length} FORMAT, {headerInfo.filterFields.length} FILTER)
        </span>
      </div>

      {expanded && (
        <div className="header-panel-content">
          {/* File Format */}
          {headerInfo.fileformat && (
            <div className="header-section">
              <h4>File Format</h4>
              <div>{headerInfo.fileformat}</div>
            </div>
          )}

          {/* INFO Fields */}
          {headerInfo.infoFields.length > 0 && (
            <div className="header-section">
              <h4>INFO Fields ({headerInfo.infoFields.length})</h4>
              <ul>
                {headerInfo.infoFields.slice(0, 10).map((field) => (
                  <li key={field.id} title={field.description}>
                    <strong>{field.id}</strong>: {field.type} ({field.number})
                  </li>
                ))}
                {headerInfo.infoFields.length > 10 && (
                  <li>... and {headerInfo.infoFields.length - 10} more</li>
                )}
              </ul>
            </div>
          )}

          {/* FORMAT Fields */}
          {headerInfo.formatFields.length > 0 && (
            <div className="header-section">
              <h4>FORMAT Fields ({headerInfo.formatFields.length})</h4>
              <ul>
                {headerInfo.formatFields.map((field) => (
                  <li key={field.id} title={field.description}>
                    <strong>{field.id}</strong>: {field.type} ({field.number})
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* FILTER Fields */}
          {headerInfo.filterFields.length > 0 && (
            <div className="header-section">
              <h4>FILTER Values ({headerInfo.filterFields.length})</h4>
              <ul>
                {headerInfo.filterFields.map((field) => (
                  <li key={field.id} title={field.description}>
                    <strong>{field.id}</strong>: {field.description}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Samples */}
          {headerInfo.samples.length > 0 && (
            <div className="header-section">
              <h4>Samples ({headerInfo.samples.length})</h4>
              <ul>
                {headerInfo.samples.slice(0, 10).map((sample) => (
                  <li key={sample}>{sample}</li>
                ))}
                {headerInfo.samples.length > 10 && (
                  <li>... and {headerInfo.samples.length - 10} more</li>
                )}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
