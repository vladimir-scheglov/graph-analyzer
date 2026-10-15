import React from 'react';
import { Section } from '../Section';
import { LINKAGE_COLOR, FQID_COLOR } from '../../../lib/graph-transforms';

export function LegendSection() {
    return (
        <Section id="legend" title="Легенда" icon="palette">
            <div className="legend-list">
                <div className="legend-row">
                    <span className="legend-dot" style={{ background: 'var(--success)' }} /> Domain
                </div>
                <div className="legend-row">
                    <span className="legend-dot" style={{ background: 'var(--warning)' }} /> Missing
                </div>
                <div className="legend-row">
                    <span className="legend-dot" style={{ background: 'var(--danger)' }} /> Broken
                </div>
                <div className="legend-row">
                    <span className="legend-line" style={{ background: LINKAGE_COLOR }} /> Linkage
                </div>
                <div className="legend-row">
                    <span className="legend-line" style={{ background: FQID_COLOR }} /> FQID
                </div>
            </div>
        </Section>
    );
}