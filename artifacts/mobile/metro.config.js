const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
// Two levels up: artifacts/mobile → artifacts → workspace root
const workspaceRoot = path.resolve(projectRoot, '../..');

const config = getDefaultConfig(projectRoot);

// 1. Watch all files in the monorepo so Metro picks up shared packages
config.watchFolders = [workspaceRoot];

// 2. Resolve packages from the artifact's own node_modules first,
//    then fall back to the workspace root (handles pnpm hoisting)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(workspaceRoot, 'node_modules'),
];

// 3. Follow pnpm symlinks so Metro can find font/asset files inside
//    the pnpm content-addressable store (.pnpm/...)
config.resolver.unstable_enableSymlinks = true;

module.exports = config;
