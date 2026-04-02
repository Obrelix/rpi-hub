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

  async extractUpload(filePath, deployPath, originalName) {
    const name = (originalName || path.basename(filePath)).toLowerCase();
    if (name.endsWith('.zip')) {
      const zip = new AdmZip(filePath);
      // Guard against zip path traversal
      const resolvedDeploy = path.resolve(deployPath);
      for (const entry of zip.getEntries()) {
        const entryPath = path.resolve(path.join(resolvedDeploy, entry.entryName));
        if (!entryPath.startsWith(resolvedDeploy + path.sep) && entryPath !== resolvedDeploy) {
          throw new Error(`Zip entry "${entry.entryName}" attempts path traversal`);
        }
      }
      zip.extractAllTo(deployPath, true);
    } else if (name.endsWith('.tar.gz') || name.endsWith('.tgz')) {
      await tar.extract({ file: filePath, cwd: deployPath });
    } else {
      throw new Error(`Unsupported archive format. Use .zip, .tar.gz, or .tgz`);
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
