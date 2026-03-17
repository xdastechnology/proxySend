const os = require('os');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..');

function isServerlessRuntime() {
  const vercel = String(process.env.VERCEL || '').toLowerCase();
  if (vercel === '1' || vercel === 'true') return true;
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return true;
  return false;
}

function getDataDir() {
  if (isServerlessRuntime()) {
    return path.join(os.tmpdir(), 'proxysend');
  }
  return path.join(ROOT_DIR, 'data');
}

function getUploadsDir() {
  return path.join(getDataDir(), 'uploads');
}

function getTemplateMediaDir() {
  return path.join(getUploadsDir(), 'template-media');
}

function getTemplateTempDir() {
  return path.join(getUploadsDir(), 'template-temp');
}

function getContactImportDir() {
  return path.join(getUploadsDir(), 'imports');
}

module.exports = {
  ROOT_DIR,
  isServerlessRuntime,
  getDataDir,
  getUploadsDir,
  getTemplateMediaDir,
  getTemplateTempDir,
  getContactImportDir,
};
