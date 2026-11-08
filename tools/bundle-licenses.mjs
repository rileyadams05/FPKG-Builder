import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(process.argv[2] || join(repo, 'src-tauri/resources/licenses'));
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });

const metadata = spawnSync('cargo', ['metadata', '--format-version', '1', '--manifest-path', join(repo, 'src-tauri/Cargo.toml')], { cwd: repo, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
if (metadata.status !== 0) throw new Error(metadata.stderr || 'cargo metadata failed');
const packages = JSON.parse(metadata.stdout).packages.filter(pkg => pkg.source);
const lines = ['# Rust dependency license inventory', '', 'Generated from `src-tauri/Cargo.lock` by `tools/bundle-licenses.mjs`.', '', '| Crate | Version | Declared license | Source |', '| --- | --- | --- | --- |'];
const accepted = /^(LICENSE|LICENCE|COPYING|NOTICE)([.-]|$)/i;
for (const pkg of packages.sort((a, b) => a.name.localeCompare(b.name) || a.version.localeCompare(b.version))) {
  const root = dirname(pkg.manifest_path);
  const licenseFiles = readdirSync(root).filter(file => accepted.test(file));
  if (licenseFiles.length) {
    const target = join(output, 'rust', `${pkg.name}-${pkg.version}`.replace(/[^A-Za-z0-9._+-]/g, '_'));
    mkdirSync(target, { recursive: true });
    for (const file of licenseFiles) copyFileSync(join(root, file), join(target, basename(file)));
  }
  const license = (pkg.license || 'SEE LICENSE FILES').replaceAll('|', '\\|');
  lines.push(`| ${pkg.name} | ${pkg.version} | ${license} | ${pkg.repository || pkg.source} |`);
}

for (const [packageName, licenseNames] of [
  ['@tauri-apps/api', ['LICENSE-MIT', 'LICENSE-APACHE-2.0', 'LICENSE.spdx']],
  ['@tauri-apps/plugin-dialog', ['LICENSE.spdx']]
]) {
  const from = join(repo, 'node_modules', packageName);
  const to = join(output, 'npm', packageName.replaceAll('/', '_'));
  mkdirSync(to, { recursive: true });
  for (const license of licenseNames) {
    try { copyFileSync(join(from, license), join(to, license)); }
    catch { if (license !== 'LICENSE.spdx') throw new Error(`Missing ${packageName}/${license}`); }
  }
}
writeFileSync(join(repo, 'src-tauri/resources/THIRD_PARTY_DEPENDENCY_LICENSES.md'), lines.join('\n') + '\n');
console.log(`Bundled license texts for ${packages.length} Rust crates and the Tauri JavaScript API packages.`);
