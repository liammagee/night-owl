const { spawn } = require('child_process');
const path = require('path');

class ElectronTestHelper {
  constructor() {
    this.electronProcess = null;
  }

  async startElectron() {
    const electronPath = require('electron');
    const appPath = path.join(__dirname, '../../');
    
    return new Promise((resolve, reject) => {
      let startupTimeout = null;
      let settled = false;

      const cleanupTimeout = () => {
        if (startupTimeout) {
          clearTimeout(startupTimeout);
          startupTimeout = null;
        }
      };

      const resolveOnce = (value) => {
        if (settled) return;
        settled = true;
        cleanupTimeout();
        resolve(value);
      };

      const rejectOnce = (error) => {
        if (settled) return;
        settled = true;
        cleanupTimeout();
        reject(error);
      };

      // Create clean environment without ELECTRON_RUN_AS_NODE (conflicts with Electron GUI mode)
      const { ELECTRON_RUN_AS_NODE, ...cleanEnv } = process.env;
      this.electronProcess = spawn(electronPath, [appPath, '--dev'], {
        stdio: 'pipe',
        env: { ...cleanEnv, NODE_ENV: 'test' }
      });
      
      this.electronProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('Electron stdout:', output);
        if (output.includes('ready-to-show') || output.includes('App ready')) {
          resolveOnce(this.electronProcess);
        }
      });
      
      this.electronProcess.stderr.on('data', (data) => {
        console.error('Electron stderr:', data.toString());
      });
      
      this.electronProcess.on('error', rejectOnce);
      
      // Timeout after 30 seconds
      startupTimeout = setTimeout(() => {
        if (!this.electronProcess.killed) {
          this.electronProcess.kill();
          rejectOnce(new Error('Electron app start timeout'));
        }
      }, 30000);
    });
  }

  async stopElectron() {
    return new Promise((resolve) => {
      if (this.electronProcess && !this.electronProcess.killed) {
        this.electronProcess.on('close', resolve);
        this.electronProcess.kill();
      } else {
        resolve();
      }
    });
  }
}

module.exports = ElectronTestHelper;
