const { globalShortcut } = require('electron');

let registeredTrayInstance = null;

/**
 * Registers the global shortcut to toggle the tray menu.
 * Requires the tray instance to be passed.
 * @param {Tray} trayInstance - The application's tray instance.
 */
function registerGlobalShortcut(trayInstance) {
  if (!trayInstance) {
    console.error('[Shortcuts] Cannot register shortcut: Tray instance is missing.');
    return;
  }
  registeredTrayInstance = trayInstance; // Store for use in the callback

  const shortcut = 'Shift+Option+Command+J';
  try {
    const ret = globalShortcut.register(shortcut, () => {
      if (registeredTrayInstance && !registeredTrayInstance.isDestroyed()) {
          console.log(`[Shortcuts] Global shortcut '${shortcut}' triggered!`);
          // Ensure popUpContextMenu exists and is callable
          if (typeof registeredTrayInstance.popUpContextMenu === 'function') {
              registeredTrayInstance.popUpContextMenu();
          } else {
              console.error('[Shortcuts] trayInstance does not have popUpContextMenu method.');
          }
      } else {
          console.error("[Shortcuts] Shortcut triggered but tray instance is missing or destroyed!");
          // Optionally try to re-acquire or disable shortcut?
      }
    });

    if (!ret) {
      console.warn(`[Shortcuts] Global shortcut '${shortcut}' registration failed. Is it already registered by another application?`);
    } else {
        console.log(`[Shortcuts] Global shortcut '${shortcut}' registered successfully.`);
    }
  } catch (error) {
      console.error(`[Shortcuts] Error registering global shortcut '${shortcut}':`, error);
  }
}

/**
 * Unregisters all global shortcuts used by the application.
 * Should be called before the app quits.
 */
function unregisterGlobalShortcuts() {
  globalShortcut.unregisterAll();
  console.log('[Shortcuts] Global shortcuts unregistered.');
  registeredTrayInstance = null; // Clear reference
}

module.exports = {
  registerGlobalShortcut,
  unregisterGlobalShortcuts,
};
