'use strict';

const fs = require('fs');
const path = require('path');

/**
 * Load a JSON config file and substitute ${ENV_VAR} placeholders with environment variables.
 */
function loadConfig(filename) {
  const configPath = path.join(process.cwd(), 'config', filename);
  const raw = fs.readFileSync(configPath, 'utf8');
  // Substitute ${VAR_NAME} with process.env values
  const substituted = raw.replace(/\$\{([^}]+)\}/g, (match, varName) => {
    return process.env[varName] || match;
  });
  return JSON.parse(substituted);
}

function getSources() {
  return loadConfig('sources.json').sources;
}

function getDeliveryConfig() {
  return loadConfig('delivery.json');
}

module.exports = { loadConfig, getSources, getDeliveryConfig };
