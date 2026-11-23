/**
 * Files that sit beside a model and only help another model run: an MTP head, a draft model for
 * speculative decoding, or a quantizer's importance matrix. They carry no main weights, so they are not
 * models: loaded alone they crash the engine. A name is a helper when its file name (any folder
 * dropped) starts with `mtp-` or `mtp_`, or has `imatrix` or `draft` as a whole word between `-`, `_`
 * and `.` (so `Overdraft-7B` is not one, and neither is `Qwen3-MTP-Q4_K_M`).
 */
export function isHelperModelFile(fileName: string): boolean {
  const base = (fileName.split('/').pop() ?? '').toLowerCase();
  if (base.startsWith('mtp-') || base.startsWith('mtp_')) return true;
  return base.split(/[-_.]/).some(token => token === 'imatrix' || token === 'draft');
}
