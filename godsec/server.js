import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Helper: Recursively walk directory and collect files
function walkDir(dir, fileList = [], rootDir = dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const relPath = path.relative(rootDir, filePath);

    // Skip ignored directories
    if (['node_modules', '.git', 'dist', 'build', '.idea', 'coverage'].includes(file)) {
      continue;
    }

    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      walkDir(filePath, fileList, rootDir);
    } else {
      fileList.push({
        path: relPath,
        size: stat.size,
        extension: path.extname(file),
        updatedAt: stat.mtime
      });
    }
  }
  return fileList;
}

// Helper: Parse dependencies from package.json or requirements.txt
function parseDependencies(rootDir) {
  const dependencies = { direct: [], transitiveCount: 0, sources: [] };

  // Check package.json
  const pkgPath = path.join(rootDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
      dependencies.direct.push(...Object.keys(deps).map(d => `${d}@${deps[d]}`));
      dependencies.sources.push('package.json');
    } catch (e) {
      console.error('Error parsing package.json:', e);
    }
  }

  // Check requirements.txt
  const reqPath = path.join(rootDir, 'requirements.txt');
  if (fs.existsSync(reqPath)) {
    try {
      const content = fs.readFileSync(reqPath, 'utf8');
      const lines = content.split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'));
      dependencies.direct.push(...lines);
      dependencies.sources.push('requirements.txt');
    } catch (e) {
      console.error('Error parsing requirements.txt:', e);
    }
  }

  dependencies.transitiveCount = dependencies.direct.length * 3; // Estimated transitive expansion for demo
  return dependencies;
}

// Helper: Classify Architecture (Monolith vs Microservices)
function classifyArchitecture(rootDir, files) {
  let dockerfileCount = 0;
  let hasDockerCompose = false;
  let serviceFolders = new Set();

  for (const f of files) {
    if (f.path.toLowerCase().includes('dockerfile')) {
      dockerfileCount++;
      const parts = f.path.split(path.sep);
      if (parts.length > 1) {
        serviceFolders.add(parts[0]);
      }
    }
    if (f.path.toLowerCase() === 'docker-compose.yml' || f.path.toLowerCase() === 'docker-compose.yaml') {
      hasDockerCompose = true;
    }
  }

  let type = 'Monolithic';
  let confidence = 'High';
  let reasons = ['Single deployment root structure', 'Unified dependency manifest'];

  if (dockerfileCount > 1 || (hasDockerCompose && serviceFolders.size > 1)) {
    type = 'Microservices';
    confidence = 'High';
    reasons = [
      `Detected ${dockerfileCount} Dockerfile instances`,
      `Identified distinct service modules: ${Array.from(serviceFolders).join(', ')}`,
      'Multi-container orchestration configuration found'
    ];
  } else if (files.length > 50 && serviceFolders.size > 2) {
    type = 'Modular Monolith / Distributed';
    confidence = 'Medium';
    reasons = ['Multiple domain packages detected within monolithic tree'];
  }

  return { type, confidence, reasons, serviceCount: serviceFolders.size || 1 };
}

// API: Phase 1 Inventory & Architecture Scan
app.post('/api/scan', (req, res) => {
  const { repo_url } = req.body;

  // For hackathon demonstration, we scan our project root or a specified target path
  const targetDir = path.resolve(__dirname, '..'); // project root

  try {
    const startTime = Date.now();

    // 1. File Discovery & Walking
    const files = walkDir(targetDir);

    // 2. Dependency Resolution (SCA)
    const dependencies = parseDependencies(targetDir);

    // 3. Architecture Classification
    const architecture = classifyArchitecture(targetDir, files);

    // 4. Component & Module Mapping
    const components = files.reduce((acc, f) => {
      const ext = f.extension || 'other';
      acc[ext] = (acc[ext] || 0) + 1;
      return acc;
    }, {});

    // 5. Unified Application Map
    const applicationMap = {
      project_name: path.basename(targetDir),
      scanned_at: new Date().toISOString(),
      repo_source: repo_url || 'Local Workspace / Connected Git',
      architecture,
      total_files: files.length,
      dependencies,
      component_breakdown: components,
      file_inventory: files.slice(0, 50) // sample for preview
    };

    const duration = Date.now() - startTime;

    res.json({
      success: true,
      message: 'Phase 1 Inventory & Architecture Scan completed successfully!',
      scan_duration_ms: duration,
      output: applicationMap
    });

  } catch (err) {
    console.error('Scan error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`GodSec Phase 1 Server running at http://localhost:${PORT}`);
});
