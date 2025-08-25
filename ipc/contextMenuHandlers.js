// === Context Menu IPC Handlers ===
// Handles context menu operations including scholar support

const { ipcMain, Menu, BrowserWindow } = require('electron');

function register(dependencies) {
  const { aiService } = dependencies;
  
  console.log('[ContextMenuHandlers] Registering context menu handlers...');
  
  // Handle text selection context menu
  ipcMain.handle('show-text-context-menu', async (event, data) => {
    const { selectedText, x, y } = data;
    
    console.log('[ContextMenu] Showing context menu for selected text:', selectedText?.substring(0, 50) + '...');
    
    const template = [
      {
        label: '📑 Generate AI Heading',
        click: async () => {
          console.log('[ContextMenu] Generate AI Heading clicked');
          
          // Send command back to renderer to handle the heading generation
          const window = BrowserWindow.fromWebContents(event.sender);
          if (window) {
            window.webContents.send('generate-ai-heading', { 
              selectedText: selectedText 
            });
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Copy',
        role: 'copy'
      },
      {
        label: 'Cut',
        role: 'cut'
      },
      {
        label: 'Paste',
        role: 'paste'
      }
    ];
    
    const menu = Menu.buildFromTemplate(template);
    const window = BrowserWindow.fromWebContents(event.sender);
    
    if (window) {
      menu.popup({ 
        window: window,
        x: x,
        y: y
      });
    }
    
    return true;
  });
  
  // Handle line number context menu (existing functionality)
  ipcMain.handle('show-context-menu', async (event, data) => {
    const { lineNumber } = data;
    
    console.log('[ContextMenu] Showing context menu for line:', lineNumber);
    
    const template = [
      {
        label: 'Go to Line',
        click: () => {
          const window = BrowserWindow.fromWebContents(event.sender);
          if (window) {
            window.webContents.send('context-menu-command', { 
              command: 'gotoLine', 
              lineNumber: lineNumber 
            });
          }
        }
      },
      {
        label: 'Toggle Breakpoint',
        click: () => {
          const window = BrowserWindow.fromWebContents(event.sender);
          if (window) {
            window.webContents.send('context-menu-command', { 
              command: 'toggleBreakpoint', 
              lineNumber: lineNumber 
            });
          }
        }
      }
    ];
    
    const menu = Menu.buildFromTemplate(template);
    const window = BrowserWindow.fromWebContents(event.sender);
    
    if (window) {
      menu.popup({ window: window });
    }
    
    return true;
  });
  
  console.log('[ContextMenuHandlers] Registered 2 context menu handlers');
}

module.exports = { register };