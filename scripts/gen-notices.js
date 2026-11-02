#!/usr/bin/env node
// Writes src/generated/thirdPartyNotices.json for the Open-source licenses screen.
// Run after adding or upgrading a dependency: node scripts/gen-notices.js
// npm packages are found automatically; native code and bundled models are listed by hand below.
const { createHash } = require('node:crypto');
const { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } = require('node:fs');
const { join } = require('node:path');

const ROOT = join(__dirname, '..');
const OUT = join(ROOT, 'src/generated/thirdPartyNotices.json');

// Bundled native components and models that npm does not know about. textId points at a
// license text collected from npm packages (or 'none' when the license is linked instead).
const NATIVE = [
  { title: 'llama.cpp / ggml (incl. Hexagon NPU kernels)', license: 'MIT', copyright: 'Copyright (c) 2023-2026 The ggml authors', url: 'https://github.com/ggml-org/llama.cpp', textId: 'MIT' },
  { title: 'whisper.cpp', license: 'MIT', copyright: 'Copyright (c) 2023-2026 The ggml authors', url: 'https://github.com/ggml-org/whisper.cpp', textId: 'MIT' },
  { title: 'local-dream (libstable_diffusion_core.so, image generation)', license: 'CC-BY-NC-4.0', copyright: 'Copyright (c) xororz', url: 'https://github.com/xororz/local-dream', note: 'Included unmodified under the Creative Commons Attribution-NonCommercial 4.0 International license: https://creativecommons.org/licenses/by-nc/4.0/. Non-commercial use only. Provided as is, without warranties.', textId: 'none' },
  { title: 'MNN (inside local-dream)', license: 'Apache-2.0', copyright: 'Copyright (c) Alibaba Group Holding Limited', url: 'https://github.com/alibaba/MNN', textId: 'Apache-2.0' },
  { title: 'stable-diffusion.cpp (inside local-dream)', license: 'MIT', copyright: 'Copyright (c) 2023 leejet', url: 'https://github.com/leejet/stable-diffusion.cpp', textId: 'MIT' },
  { title: 'tokenizers-cpp (inside local-dream)', license: 'Apache-2.0', copyright: 'Copyright (c) MLC LLM contributors', url: 'https://github.com/mlc-ai/tokenizers-cpp', textId: 'Apache-2.0' },
  { title: 'xtensor (inside local-dream)', license: 'BSD-3-Clause', copyright: 'Copyright (c) Johan Mabille, Sylvain Corlay and Wolf Vollprecht', url: 'https://github.com/xtensor-stack/xtensor', textId: 'BSD-3-Clause' },
  { title: 'cpp-httplib (inside local-dream)', license: 'MIT', copyright: 'Copyright (c) 2017 yhirose', url: 'https://github.com/yhirose/cpp-httplib', textId: 'MIT' },
  { title: 'stb (inside local-dream)', license: 'MIT', copyright: 'Copyright (c) 2017 Sean Barrett', url: 'https://github.com/nothings/stb', textId: 'MIT' },
  { title: 'zstd (inside local-dream)', license: 'BSD-3-Clause', copyright: 'Copyright (c) Meta Platforms, Inc. and affiliates', url: 'https://github.com/facebook/zstd', textId: 'BSD-3-Clause' },
  { title: 'JSON for Modern C++ (inside local-dream)', license: 'MIT', copyright: 'Copyright (c) 2013-2026 Niels Lohmann', url: 'https://github.com/nlohmann/json', textId: 'MIT' },
  { title: 'Qualcomm AI Engine Direct (QNN) runtime libraries', license: 'Proprietary', copyright: 'Copyright (c) Qualcomm Technologies, Inc.', url: 'https://www.qualcomm.com/developer/software/qualcomm-ai-engine-direct-sdk', note: 'Runtime libraries redistributed for Snapdragon NPU acceleration, subject to Qualcomm\'s license terms.', textId: 'none' },
  { title: 'PdfiumAndroid', license: 'Apache-2.0', copyright: 'Copyright (c) Legere', url: 'https://github.com/johngray1965/PdfiumAndroidKt', textId: 'Apache-2.0' },
  { title: 'PDFium', license: 'BSD-3-Clause', copyright: 'Copyright 2014 The PDFium Authors', url: 'https://pdfium.googlesource.com/pdfium/', textId: 'BSD-3-Clause' },
  { title: 'LiteRT-LM', license: 'Apache-2.0', copyright: 'Copyright Google LLC', url: 'https://github.com/google-ai-edge/LiteRT-LM', textId: 'Apache-2.0' },
  { title: 'AndroidX (Room, WorkManager, Lifecycle)', license: 'Apache-2.0', copyright: 'Copyright The Android Open Source Project', url: 'https://developer.android.com/jetpack/androidx', textId: 'Apache-2.0' },
  { title: 'Kotlin coroutines', license: 'Apache-2.0', copyright: 'Copyright JetBrains s.r.o. and Kotlin Programming Language contributors', url: 'https://github.com/Kotlin/kotlinx.coroutines', textId: 'Apache-2.0' },
  { title: 'OkHttp', license: 'Apache-2.0', copyright: 'Copyright Square, Inc.', url: 'https://github.com/square/okhttp', textId: 'Apache-2.0' },
  { title: 'all-MiniLM-L6-v2 (bundled embedding model)', license: 'Apache-2.0', copyright: 'Copyright sentence-transformers contributors', url: 'https://huggingface.co/sentence-transformers/all-MiniLM-L6-v2', textId: 'Apache-2.0' },
];

const COPYRIGHT_LINE = /^\s*(copyright\b|\(c\)|©)/i;
const LICENSE_FILE = /^(licen[cs]e|copying)(\.(md|txt|markdown))?$/i;

const findFile = (dir, re) => readdirSync(dir).find(f => re.test(f));
const read = (dir, re) => {
  const f = existsSync(dir) && findFile(dir, re);
  return f ? readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim() : '';
};
const licenseId = p =>
  typeof p.license === 'string' ? p.license
    : p.license?.type ?? (Array.isArray(p.licenses) ? p.licenses.map(l => l.type ?? l).join(' OR ') : 'UNKNOWN');

const texts = {}; // textId -> license body (copyright lines removed, so identical bodies dedupe)
const firstTextFor = {}; // license id -> textId of the first body seen, reused by NATIVE entries
const addText = (id, body) => {
  const textId = createHash('sha1').update(body).digest('hex').slice(0, 12);
  texts[textId] = body;
  firstTextFor[id] ??= textId;
  return textId;
};

// Production packages = lockfile entries not marked dev-only; skip platform packages not installed here.
const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8'));
const dirs = Object.entries(lock.packages)
  .filter(([path, meta]) => path && !meta.dev && !meta.link)
  .map(([path]) => join(ROOT, path));
const seen = new Set();
const packages = [];
for (const dir of dirs) {
  const pkgFile = join(dir, 'package.json');
  if (!existsSync(pkgFile)) continue;
  const pkg = JSON.parse(readFileSync(pkgFile, 'utf8'));
  const key = `${pkg.name}@${pkg.version}`;
  if (seen.has(key)) continue;
  seen.add(key);
  const raw = read(dir, LICENSE_FILE);
  const lines = raw.split('\n');
  const copyright = lines.filter(l => COPYRIGHT_LINE.test(l)).slice(0, 3).map(l => l.trim()).join('\n');
  const body = lines.filter(l => !COPYRIGHT_LINE.test(l)).join('\n').trim();
  const license = licenseId(pkg);
  const entry = { title: key, license, copyright, textId: body ? addText(license, body) : 'none' };
  const notice = read(dir, /^notice(\.(md|txt))?$/i);
  if (notice) entry.note = notice;
  packages.push(entry);
}
// Packages that ship no license file get the standard text of their declared license.
for (const p of packages) if (p.textId === 'none' && firstTextFor[p.license]) p.textId = firstTextFor[p.license];
packages.sort((a, b) => a.title.localeCompare(b.title));

const native = NATIVE.map(n => {
  if (n.textId === 'none') return n;
  const textId = firstTextFor[n.textId];
  if (!textId) throw new Error(`no ${n.textId} text found among npm packages for ${n.title}`);
  return { ...n, textId };
});

const upstreamLicense = readFileSync(join(ROOT, 'LICENSE'), 'utf8').replace(/\r\n/g, '\n').trim();
const notices = {
  base: { title: 'Off Grid AI (the open-source app this one is based on)', license: 'MIT', body: upstreamLicense },
  native,
  packages,
  texts,
};
mkdirSync(join(ROOT, 'src/generated'), { recursive: true });
writeFileSync(OUT, `${JSON.stringify(notices)}\n`);
console.log(`${packages.length} npm packages, ${native.length} native components, ${Object.keys(texts).length} distinct license texts -> ${OUT}`);
