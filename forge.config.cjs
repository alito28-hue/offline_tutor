'use strict';
// Builds two Mac disk images from the same app:
//   AMARA_KIT=full    carries the models, for schools with no internet (pendrive)
//   AMARA_KIT=online  downloads them the first time it opens
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const QvacForgePlugin = require('@qvac/sdk/electron-forge');

const kit = process.env.AMARA_KIT === 'full' ? 'full' : 'online';
const assets = path.join(__dirname, 'desktop/assets');
const packagerConfig = {
  name: 'Amara',
  executableName: 'Amara',
  appBundleId: 'org.amaratutor.app',
  appCategoryType: 'public.app-category.education',
  icon: path.join(assets, 'icon'),
  // A list of what goes in, so that nothing else in the folder can end up in the app.
  ignore: [
    /^\/(?!(desktop|tutor|node_modules|qvac|package\.json|qvac\.config\.json|LICENSE|forge\.config\.cjs)($|\/))/,
    /^\/tutor\/(test|\.run|demo_script\.md|README\.md)($|\/)/,
    /^\/desktop\/windows($|\/)/,
  ],
};

// With AMARA_SIGN_IDENTITY set, the app is signed; with AMARA_NOTARY_PROFILE too, it is notarized and stapled,
// so that macOS accepts it on a computer with no internet.
if (process.env.AMARA_SIGN_IDENTITY) {
  const entitlements = path.join(__dirname, 'desktop/entitlements.plist');
  packagerConfig.osxSign = {
    identity: process.env.AMARA_SIGN_IDENTITY,
    ignore: file => file.endsWith('.gguf'),
    optionsForFile: () => ({ hardenedRuntime: true, entitlements }),
  };
}
if (process.env.AMARA_NOTARY_PROFILE) packagerConfig.osxNotarize = { keychainProfile: process.env.AMARA_NOTARY_PROFILE };

if (kit === 'full') {
  // Hard links when possible, so that staging the models takes no extra disk space or time.
  const source = path.join(os.homedir(), '.qvac/models');
  const stage = path.join(__dirname, 'build/models');
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  for (const name of ['Qwen3-4B-Q4_K_M.gguf', 'embeddinggemma-300M-Q8_0.gguf']) {
    const file = fs.readdirSync(source).find(f => f.endsWith(name));
    if (!file) throw new Error(`${name} is missing in ${source}. Run: node tutor/tools/fetch_models.mjs`);
    // Links fail across disks, as on some Windows machines; a copy works everywhere.
    try { fs.linkSync(path.join(source, file), path.join(stage, file)); } catch { fs.copyFileSync(path.join(source, file), path.join(stage, file)); }
  }
  packagerConfig.extraResource = [stage];
}

module.exports = {
  outDir: `out/${kit}`,
  packagerConfig,
  rebuildConfig: {},
  makers: [{
    name: '@electron-forge/maker-dmg',
    platforms: ['darwin'],
    config: {
      name: kit === 'full' ? 'Amara Completo' : 'Amara',
      title: 'Amara',
      icon: path.join(assets, 'icon.icns'),
      background: path.join(assets, 'dmg-background.png'),
      format: 'ULFO',
      contents: opts => [
        { x: 170, y: 190, type: 'file', path: opts.appPath },
        { x: 490, y: 190, type: 'link', path: '/Applications' },
      ],
      additionalDMGOptions: { window: { size: { width: 660, height: 400 } } },
    },
  }],
  plugins: [new QvacForgePlugin({ logLevel: 'info' })],
  hooks: {
    // The two files people receive, with names that say which is which.
    postMake: async (_config, results) => {
      const label = kit === 'full' ? 'Completo-Offline' : 'Instalador-Online';
      const version = require('./package.json').version;
      for (const result of results) {
        result.artifacts = result.artifacts.map(file => {
          if (!file.endsWith('.dmg')) return file;
          const named = path.join(path.dirname(file), `Amara-${version}-Mac-${label}.dmg`);
          fs.renameSync(file, named);
          // The disk image gets its own signature and ticket, so that a downloaded copy opens without warnings.
          if (process.env.AMARA_SIGN_IDENTITY) execFileSync('codesign', ['--force', '--sign', process.env.AMARA_SIGN_IDENTITY, '--timestamp', named], { stdio: 'inherit' });
          if (process.env.AMARA_NOTARY_PROFILE) {
            execFileSync('xcrun', ['notarytool', 'submit', named, '--keychain-profile', process.env.AMARA_NOTARY_PROFILE, '--wait'], { stdio: 'inherit' });
            execFileSync('xcrun', ['stapler', 'staple', named], { stdio: 'inherit' });
          }
          return named;
        });
      }
      return results;
    },
  },
};
