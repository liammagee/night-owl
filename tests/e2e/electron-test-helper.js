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
      this.electronProcess = spawn(electronPath, [appPath, '--dev'], {
        stdio: 'pipe',
        env: { ...process.env, NODE_ENV: 'test' }
      });
      
      this.electronProcess.stdout.on('data', (data) => {
        const output = data.toString();
        console.log('Electron stdout:', output);
        if (output.includes('ready-to-show') || output.includes('App ready')) {
          resolve(this.electronProcess);
        }
      });
      
      this.electronProcess.stderr.on('data', (data) => {
        console.error('Electron stderr:', data.toString());
      });
      
      this.electronProcess.on('error', reject);
      
      // Timeout after 30 seconds
      setTimeout(() => {
        if (!this.electronProcess.killed) {
          this.electronProcess.kill();
          reject(new Error('Electron app start timeout'));
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