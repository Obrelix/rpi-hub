const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const AdmZip = require('adm-zip');
const tar = require('tar');

class DeployService {
  gitPull(deployPath, onData) {
    return new Promise((resolve, reject) => {
      const proc = spawn('git', ['-C', deployPath, 'pull'], {
        stdio: ['ignore', 'pipe', 'pipe']
      });
      let output = '';
      proc.stdout.on('data', (data) => {
        const text = data.toString();
        output += text;
        if (onData) onData(text);
      });
      proc.stderr.on('data', (data) => {
        const text = data.toString();
        output += text;
        if (onData) onData(text);
      });
      proc.on('close', (code) => {
        code === 0
          ? resolve(output)
          : reject(new Error(`git pull exited with code ${code}\n${output}`));
      });
      proc.on('error', reject);
    });
  }

  async extractUpload(filePath, deployPath) {
    const ext = path.extname(filePath).toLowerCase();
    const basename = path.basename(filePath).toLowerCase();
    if (ext === '.zip') {
      const zip = new AdmZip(filePath);
      zip.extractAllTo(deployPath, true);
    } else if (basename.endsWith('.tar.gz') || basename.endsWith('.tgz')) {
      await tar.extract({ file: filePath, cwd: deployPath });
    } else {
      throw new Error(`Unsupported archive format: ${ext}`);
    }
  }

  getTmpDir() {
    const dir = path.join(os.tmpdir(), 'rpi-hub-uploads');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    return dir;
  }

  cleanup(filePath) {
    try {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    } catch {}
  }
}

module.exports = DeployService;
