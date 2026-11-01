'use strict';
// Application menu from Electron roles only, so the OS supplies (and localizes) every label and the copy/paste shortcuts
// work inside the window, especially on macOS. Developer tools only in unpackaged runs. No electron import.

/**
 * @param {{ platform: string, isPackaged: boolean }} options
 * @returns {object[]} a Menu.buildFromTemplate template
 */
function buildMenuTemplate({ platform, isPackaged }) {
  const isMac = platform === 'darwin';
  const view = isPackaged
    ? [{ role: 'reload' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }]
    : [{ role: 'reload' }, { role: 'forceReload' }, { role: 'toggleDevTools' }, { type: 'separator' }, { role: 'resetZoom' }, { role: 'zoomIn' }, { role: 'zoomOut' }, { type: 'separator' }, { role: 'togglefullscreen' }];
  return [...(isMac ? [{ role: 'appMenu' }] : []), { role: 'fileMenu' }, { role: 'editMenu' }, { role: 'viewMenu', submenu: view }, { role: 'windowMenu' }];
}

module.exports = { buildMenuTemplate };
