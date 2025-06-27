const { app, BrowserWindow, Menu, dialog, shell } = require('electron');
const path = require('path');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
      preload: path.join(__dirname, 'preload.js')
    },
    title: 'Hegel Pedagogy AI - Interactive Presentations',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    show: false
  });

  mainWindow.loadFile('index.html');

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    
    if (process.argv.includes('--dev')) {
      mainWindow.webContents.openDevTools();
    }
  });

  // Suppress common Chrome DevTools console errors
  mainWindow.webContents.on('console-message', (event, level, message) => {
    if (message.includes('Autofill.enable') || message.includes('Autofill.setAddresses')) {
      return; // Suppress autofill-related DevTools errors
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle external links
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function createMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Markdown File',
          accelerator: 'CmdOrCtrl+O',
          click: async () => {
            const result = await dialog.showOpenDialog(mainWindow, {
              properties: ['openFile'],
              filters: [
                { name: 'Markdown Files', extensions: ['md', 'markdown'] },
                { name: 'All Files', extensions: ['*'] }
              ]
            });

            if (!result.canceled && result.filePaths.length > 0) {
              const filePath = result.filePaths[0];
              try {
                const fs = require('fs');
                const content = fs.readFileSync(filePath, 'utf-8');
                mainWindow.webContents.send('load-markdown-file', content, filePath, null);
              } catch (error) {
                console.error('Error loading file:', error);
                mainWindow.webContents.send('load-markdown-file', null, filePath, error.message);
              }
            }
          }
        },
        { type: 'separator' },
        {
          label: 'Reload',
          accelerator: 'CmdOrCtrl+R',
          click: () => {
            mainWindow.reload();
          }
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Toggle Full Screen',
          accelerator: process.platform === 'darwin' ? 'Ctrl+Cmd+F' : 'F11',
          click: () => {
            mainWindow.setFullScreen(!mainWindow.isFullScreen());
          }
        },
        {
          label: 'Zoom In',
          accelerator: 'CmdOrCtrl+Plus',
          click: () => {
            mainWindow.webContents.send('zoom-in');
          }
        },
        {
          label: 'Zoom Out',
          accelerator: 'CmdOrCtrl+-',
          click: () => {
            mainWindow.webContents.send('zoom-out');
          }
        },
        {
          label: 'Reset Zoom',
          accelerator: 'CmdOrCtrl+0',
          click: () => {
            mainWindow.webContents.send('reset-zoom');
          }
        },
        { type: 'separator' },
        {
          label: 'Toggle Developer Tools',
          accelerator: process.platform === 'darwin' ? 'Alt+Cmd+I' : 'Ctrl+Shift+I',
          click: () => {
            mainWindow.webContents.toggleDevTools();
          }
        }
      ]
    },
    {
      label: 'Navigate',
      submenu: [
        {
          label: 'Next Slide',
          accelerator: 'Right',
          click: () => {
            mainWindow.webContents.send('next-slide');
          }
        },
        {
          label: 'Previous Slide',
          accelerator: 'Left',
          click: () => {
            mainWindow.webContents.send('previous-slide');
          }
        },
        {
          label: 'First Slide',
          accelerator: 'Home',
          click: () => {
            mainWindow.webContents.send('first-slide');
          }
        },
        { type: 'separator' },
        {
          label: 'Start Presentation',
          accelerator: 'CmdOrCtrl+P',
          click: () => {
            mainWindow.webContents.send('start-presentation');
          }
        },
        {
          label: 'Exit Presentation',
          accelerator: 'Escape',
          click: () => {
            mainWindow.webContents.send('exit-presentation');
          }
        }
      ]
    },
    {
      label: 'Layout',
      submenu: [
        {
          label: 'Spiral',
          type: 'radio',
          checked: true,
          click: () => {
            mainWindow.webContents.send('change-layout', 'spiral');
          }
        },
        {
          label: 'Linear',
          type: 'radio',
          click: () => {
            mainWindow.webContents.send('change-layout', 'linear');
          }
        },
        {
          label: 'Grid',
          type: 'radio',
          click: () => {
            mainWindow.webContents.send('change-layout', 'grid');
          }
        },
        {
          label: 'Circle',
          type: 'radio',
          click: () => {
            mainWindow.webContents.send('change-layout', 'circle');
          }
        },
        {
          label: 'Tree',
          type: 'radio',
          click: () => {
            mainWindow.webContents.send('change-layout', 'tree');
          }
        },
        {
          label: 'Zigzag',
          type: 'radio',
          click: () => {
            mainWindow.webContents.send('change-layout', 'zigzag');
          }
        }
      ]
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About Hegel Pedagogy AI',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'About Hegel Pedagogy AI',
              message: 'Hegel Pedagogy AI',
              detail: 'An interactive presentation platform for exploring Hegelian philosophy and AI pedagogy.\n\nVersion 1.0.0'
            });
          }
        },
        {
          label: 'Keyboard Shortcuts',
          click: () => {
            dialog.showMessageBox(mainWindow, {
              type: 'info',
              title: 'Keyboard Shortcuts',
              message: 'Keyboard Shortcuts',
              detail: `
Navigation:
• Arrow Keys: Navigate slides
• Home: Go to first slide
• Escape: Exit presentation mode

File:
• Cmd/Ctrl+O: Open markdown file
• Cmd/Ctrl+R: Reload
• Cmd/Ctrl+Q: Quit

View:
• Cmd/Ctrl+Plus: Zoom in
• Cmd/Ctrl+Minus: Zoom out
• Cmd/Ctrl+0: Reset zoom
• F11/Ctrl+Cmd+F: Toggle fullscreen

Presentation:
• Cmd/Ctrl+P: Start presentation
• Escape: Exit presentation
              `.trim()
            });
          }
        }
      ]
    }
  ];

  // macOS specific menu adjustments
  if (process.platform === 'darwin') {
    template.unshift({
      label: app.getName(),
      submenu: [
        {
          label: 'About ' + app.getName(),
          role: 'about'
        },
        { type: 'separator' },
        {
          label: 'Services',
          role: 'services',
          submenu: []
        },
        { type: 'separator' },
        {
          label: 'Hide ' + app.getName(),
          accelerator: 'Command+H',
          role: 'hide'
        },
        {
          label: 'Hide Others',
          accelerator: 'Command+Shift+H',
          role: 'hideothers'
        },
        {
          label: 'Show All',
          role: 'unhide'
        },
        { type: 'separator' },
        {
          label: 'Quit',
          accelerator: 'Command+Q',
          click: () => {
            app.quit();
          }
        }
      ]
    });

    // Edit menu
    template[1].submenu.push(
      { type: 'separator' },
      {
        label: 'Speech',
        submenu: [
          {
            label: 'Start Speaking',
            role: 'startspeaking'
          },
          {
            label: 'Stop Speaking',
            role: 'stopspeaking'
          }
        ]
      }
    );

    // Window menu
    template.splice(-1, 0, {
      label: 'Window',
      submenu: [
        {
          label: 'Close',
          accelerator: 'CmdOrCtrl+W',
          role: 'close'
        },
        {
          label: 'Minimize',
          accelerator: 'CmdOrCtrl+M',
          role: 'minimize'
        },
        {
          label: 'Zoom',
          role: 'zoom'
        },
        { type: 'separator' },
        {
          label: 'Bring All to Front',
          role: 'front'
        }
      ]
    });
  }

  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

app.whenReady().then(() => {
  createWindow();
  createMenu();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// Handle file associations (when files are opened with the app)
app.on('open-file', (event, filePath) => {
  event.preventDefault();
  if (mainWindow) {
    try {
      const fs = require('fs');
      const content = fs.readFileSync(filePath, 'utf-8');
      mainWindow.webContents.send('load-markdown-file', content, filePath, null);
    } catch (error) {
      console.error('Error loading file:', error);
      mainWindow.webContents.send('load-markdown-file', null, filePath, error.message);
    }
  }
});