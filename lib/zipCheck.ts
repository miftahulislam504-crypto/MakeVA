import JSZip from 'jszip';
import type { ZipInfo } from './types';

export const MAX_ZIP_MB = 50;

interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
}

/** Reads only the zip index and package.json. Nothing is unpacked in memory. */
export async function inspectZip(file: File): Promise<ZipInfo> {
  if (!/\.zip$/i.test(file.name)) {
    throw new Error('Choose a .zip file.');
  }
  if (file.size > MAX_ZIP_MB * 1024 * 1024) {
    throw new Error(
      'The zip is larger than ' +
        MAX_ZIP_MB +
        ' MB. Remove build output and media you do not need.',
    );
  }

  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new Error('This file is not a valid zip archive.');
  }

  const names = Object.keys(zip.files).filter(
    (n) =>
      !zip.files[n].dir &&
      !n.startsWith('__MACOSX/') &&
      !n.includes('/__MACOSX/'),
  );

  if (names.some((n) => n.split('/').includes('node_modules'))) {
    throw new Error('Remove the node_modules folder from the zip and try again.');
  }

  const packages = names
    .filter((n) => n === 'package.json' || n.endsWith('/package.json'))
    .sort((a, b) => a.split('/').length - b.split('/').length);
  if (!packages.length) {
    throw new Error('No package.json found in the zip.');
  }

  let pkg: PackageJson;
  try {
    pkg = JSON.parse(await zip.files[packages[0]].async('string')) as PackageJson;
  } catch {
    throw new Error('package.json could not be read.');
  }

  const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
  if (!('remotion' in deps)) {
    throw new Error(
      'This does not look like a Remotion project: the "remotion" dependency is missing.',
    );
  }

  const first = packages[0];
  return {
    root: first.includes('/') ? first.slice(0, first.lastIndexOf('/')) : '.',
    fileCount: names.length,
    packageName: String(pkg.name ?? ''),
    size: file.size,
  };
}
