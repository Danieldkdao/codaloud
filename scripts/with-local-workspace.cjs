const { withDangerousMod } = require('expo/config-plugins');
const { execFileSync } = require('node:child_process');
const { join } = require('node:path');

// Run before CocoaPods resolves the vendored framework on a fresh native build.
module.exports = (config) => withDangerousMod(config, ['ios', async (mod) => {
  execFileSync(process.execPath, [join(mod.modRequest.projectRoot, 'scripts/build-local-workspace-ios.mjs')], {
    cwd: mod.modRequest.projectRoot,
    stdio: 'inherit',
  });
  return mod;
}]);
