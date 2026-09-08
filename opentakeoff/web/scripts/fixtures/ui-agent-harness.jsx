import React from 'react';
import { createRoot } from 'react-dom/client';
import Agent from '../../src/components/AgentPanel.jsx';
import Dock from '../../src/components/WorkspaceDock.jsx';

// Import the tested components together so Vite preserves context identity,
// including when this driver runs against a server with prior hot updates.
export function mountAgentHarness() {
  // Preserve the real workspace's available height, not a full-screen 900px
  // fixture that could conceal clipping below the production toolbar/status bar.
  const workspace = document.querySelector('.workspace-body').getBoundingClientRect();
  document.querySelector('#root').style.display = 'none';
  const host = document.createElement('div');
  host.style.cssText = `position:fixed;left:${workspace.left}px;top:${workspace.top}px;width:${workspace.width}px;height:${workspace.height}px;display:flex;justify-content:flex-end`;
  document.body.append(host);
  const root = createRoot(host);
  window.__uiCalls = [];
  const callback = name => (...args) => window.__uiCalls.push([
    name, ...args.map(arg => arg?.nativeEvent ? { event: arg.type } : arg),
  ]);
  const citation = { id: 'cite-1', sheet: 'test#1', bbox_px: [10,20,30,40], row_key: 'AHU-1', column: 'CFM', value: '500' };
  const props = {
    configured: true, running: false, status: '', log: [], thread: [],
    citations: [citation], proposals: [], condById: {}, sheetLabel: k => k,
    units: 'imperial', fmtArea: n => n + ' SF', takeoffRowCount: 1, acceptableCount: 1,
  };
  for (const name of ['onRun','onStop','onResetChat','onOpenCitation','onAccept','onReject','onAcceptAll','onRejectAll','onOpenSettings','onClose','onOpenTakeoff','onToggleHistory']) props[name] = callback(name);
  window.__uiRender = patch => {
    Object.assign(props, patch);
    root.render(<Dock name="Agent"><Agent {...props} /></Dock>);
  };
  window.__uiRender({});
}
