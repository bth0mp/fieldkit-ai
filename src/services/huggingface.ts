import { HFModelSearchResult, ModelInfo, ModelFile, ModelCredibility } from '../types';
import { PARAM_COUNT_REGEX } from '../constants/models';
import { HF_API, QUANTIZATION_INFO, LMSTUDIO_AUTHORS, OFFICIAL_MODEL_AUTHORS, VERIFIED_QUANTIZERS } from '../constants';
import { looksLikeVisionModel } from '../utils/visionModel';
import { isMMProjFile, pickMmProjForDownload } from './mmproj';

export type BrowseSort = 'trending' | 'downloads' | 'likes' | 'newest';

export const NEW_RELEASE_PUBLISHERS = ['unsloth', 'bartowski', 'ggml-org', 'lmstudio-community', 'QuantFactory'] as const;

// With any expand[] Hugging Face returns only _id, id and the fields asked for, so every field that
// transformModelResult reads is named here. Never add 'gguf': it sends each model's whole chat template.
// cardData only goes with the detail request: on a list it made one answer 114 KB against 19 KB.
const LIST_EXPAND = ['author', 'downloads', 'downloadsAllTime', 'likes', 'lastModified', 'createdAt', 'tags', 'pipeline_tag'];
const DETAIL_EXPAND = [...LIST_EXPAND, 'cardData', 'siblings'];
const BROWSE_EXPAND = [...LIST_EXPAND, 'siblings'];

const BROWSE_SORT: Record<BrowseSort, string> = { trending: 'trendingScore', downloads: 'downloads', likes: 'likes', newest: 'createdAt' };
const BROWSE_PIPELINES = new Set(['text-generation', 'image-text-to-text']);
// Rows the phone cannot use are dropped after the answer, so a ranked sort asks for more than it shows.
const RANKED_ROWS = 100;
const NEWEST_ROWS_PER_PUBLISHER = 30;

function isChatRow(m: ModelInfo): boolean {
  if (m.pipelineTag !== undefined) return BROWSE_PIPELINES.has(m.pipelineTag);
  return m.tags.includes('conversational');
}

function fitsParams(m: ModelInfo, maxParamsB: number): boolean {
  const match = PARAM_COUNT_REGEX.exec(m.name);
  return !match || Number.parseFloat(match[1]) <= maxParamsB;
}

// The detail screen lists only top-level model files, so a row with none leads nowhere. No siblings: keep it.
function hasTopLevelModelFile(r: HFModelSearchResult): boolean {
  return !r.siblings || r.siblings.some(s => s.rfilename.endsWith('.gguf') && !s.rfilename.includes('/') && !isMMProjFile(s.rfilename));
}

const expandParams = (fields: string[]) => fields.map(f => `expand[]=${f}`).join('&');

class HuggingFaceService {
  private baseUrl = HF_API.baseUrl;
  private apiUrl = HF_API.apiUrl;

  private async fetchJson<T>(url: string): Promise<T> {
    const response = await fetch(url, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`API error: ${response.status}`);
    return response.json() as Promise<T>;
  }

  async searchModels(
    query: string = '',
    options: { limit?: number; sort?: string; direction?: string; pipelineTag?: string } = {}
  ): Promise<ModelInfo[]> {
    const { limit = 30, sort = 'downloads', direction = '-1', pipelineTag } = options;
    const params = new URLSearchParams({ filter: 'gguf', sort, direction, limit: limit.toString() });
    if (query) params.append('search', query);
    if (pipelineTag) params.append('pipeline_tag', pipelineTag);
    return this.fetchList(params);
  }

  private fetchRows(params: URLSearchParams, expand: string[]): Promise<HFModelSearchResult[]> {
    return this.fetchJson<HFModelSearchResult[]>(`${this.apiUrl}/models?${params.toString()}&${expandParams(expand)}`);
  }

  private async fetchList(params: URLSearchParams): Promise<ModelInfo[]> {
    return (await this.fetchRows(params, LIST_EXPAND)).map(this.transformModelResult);
  }

  // Browse rows come back without their file names, so the card shows no files, as before.
  private async fetchBrowseList(params: URLSearchParams): Promise<ModelInfo[]> {
    const rows = await this.fetchRows(params, BROWSE_EXPAND);
    return rows.filter(hasTopLevelModelFile).map(({ siblings: _siblings, ...row }) => this.transformModelResult(row));
  }

  /** Server-side sorted browse, limited to models small enough for the phone. */
  async browseModels(
    query: string,
    opts: { sort: BrowseSort; maxParamsB: number; pipelineTag?: string; limit?: number }
  ): Promise<ModelInfo[]> {
    const { sort, maxParamsB, pipelineTag, limit = 30 } = opts;
    const make = (author?: string) => {
      const params = new URLSearchParams({
        filter: 'gguf', sort: BROWSE_SORT[sort], direction: '-1',
        limit: (sort === 'newest' ? NEWEST_ROWS_PER_PUBLISHER : RANKED_ROWS).toString(),
        gated: 'false', num_parameters: `min:0,max:${maxParamsB}B`,
      });
      if (query) params.append('search', query);
      if (pipelineTag) params.append('pipeline_tag', pipelineTag);
      if (author) params.append('author', author);
      return params;
    };
    let models: ModelInfo[];
    if (sort === 'newest') {
      const settled = await Promise.allSettled(NEW_RELEASE_PUBLISHERS.map(a => this.fetchBrowseList(make(a))));
      const failed = settled.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
      if (failed.length === settled.length) throw failed[0].reason;
      models = settled.flatMap(r => (r.status === 'fulfilled' ? r.value : []));
      models.sort((a, b) => (b.createdAt ?? '').localeCompare(a.createdAt ?? ''));
    } else {
      models = await this.fetchBrowseList(make());
    }
    return models
      .filter(m => isChatRow(m) && fitsParams(m, maxParamsB))
      .slice(0, limit);
  }

  async getModelDetails(modelId: string): Promise<ModelInfo> {
    const result = await this.fetchJson<HFModelSearchResult>(`${this.apiUrl}/models/${modelId}?${expandParams(DETAIL_EXPAND)}`);
    return this.transformModelResult(result);
  }

  async getModelFiles(modelId: string): Promise<ModelFile[]> {
    try {
      const response = await fetch(`${this.apiUrl}/models/${modelId}/tree/main`, { headers: { Accept: 'application/json' } });
      if (!response.ok) return this.getModelFilesFromSiblings(modelId);
      const files: Array<{ type: string; path: string; size?: number; lfs?: { size: number } }> = await response.json();
      const allGguf = files.filter(f => f.type === 'file' && f.path.endsWith('.gguf'));
      const mmProjFiles = allGguf.filter(f => this.isMMProjFile(f.path));
      const modelFiles = allGguf.filter(f => !this.isMMProjFile(f.path));
      return modelFiles
        .map(file => ({
          name: file.path,
          size: file.lfs?.size || file.size || 0,
          quantization: this.extractQuantization(file.path),
          downloadUrl: this.getDownloadUrl(modelId, file.path),
          mmProjFile: this.findMatchingMMProj(file.path, mmProjFiles, modelId),
        }))
        .sort((a, b) => a.size - b.size);
    } catch {
      return this.getModelFilesFromSiblings(modelId);
    }
  }

  private async getModelFilesFromSiblings(modelId: string): Promise<ModelFile[]> {
    const result = await this.fetchJson<HFModelSearchResult>(`${this.apiUrl}/models/${modelId}`);
    if (!result.siblings) return [];
    const allGguf = result.siblings.filter(f => f.rfilename.endsWith('.gguf'));
    const mmProjFiles = allGguf.filter(f => this.isMMProjFile(f.rfilename));
    const modelFiles = allGguf.filter(f => !this.isMMProjFile(f.rfilename));
    const mmProjForMatch = mmProjFiles.map(f => ({ path: f.rfilename, size: f.size, lfs: f.lfs }));
    return modelFiles
      .map(file => ({ ...this.transformFileInfo(modelId, file), mmProjFile: this.findMatchingMMProj(file.rfilename, mmProjForMatch, modelId) }))
      .sort((a, b) => a.size - b.size);
  }

  getDownloadUrl(modelId: string, fileName: string, revision: string = 'main'): string {
    return `${this.baseUrl}/${modelId}/resolve/${revision}/${fileName}`;
  }

  private determineCredibility(author: string): ModelCredibility {
    if (LMSTUDIO_AUTHORS.includes(author))
      return { source: 'lmstudio', isOfficial: false, isVerifiedQuantizer: true, verifiedBy: 'LM Studio' };
    if (OFFICIAL_MODEL_AUTHORS[author])
      return { source: 'official', isOfficial: true, isVerifiedQuantizer: false, verifiedBy: OFFICIAL_MODEL_AUTHORS[author] };
    if (VERIFIED_QUANTIZERS[author])
      return { source: 'verified-quantizer', isOfficial: false, isVerifiedQuantizer: true, verifiedBy: VERIFIED_QUANTIZERS[author] };
    return { source: 'community', isOfficial: false, isVerifiedQuantizer: false };
  }

  private transformModelResult = (result: HFModelSearchResult): ModelInfo => {
    const files = result.siblings
      ?.filter(file => file.rfilename.endsWith('.gguf'))
      .map(file => this.transformFileInfo(result.id, file)) || [];

    const author = result.author || result.id.split('/')[0] || 'Unknown';
    const credibility = this.determineCredibility(author);

    return {
      id: result.id,
      name: result.id.split('/').pop() || result.id,
      author,
      description: this.extractDescription(result),
      downloads: result.downloads || 0,
      downloadsAllTime: result.downloadsAllTime,
      likes: result.likes || 0,
      tags: result.tags || [],
      lastModified: result.lastModified,
      createdAt: result.createdAt,
      pipelineTag: result.pipeline_tag,
      files,
      credibility,
    };
  };

  private transformFileInfo(modelId: string, file: { rfilename: string; size?: number; lfs?: { size: number; sha256: string } }): ModelFile {
    const fileName = file.rfilename;
    const size = file.lfs?.size || file.size || 0;
    const quantization = this.extractQuantization(fileName);

    return {
      name: fileName,
      size,
      quantization,
      downloadUrl: this.getDownloadUrl(modelId, fileName),
      sha256: file.lfs?.sha256,
    };
  }

  private extractQuantization(fileName: string): string {
    const upperName = fileName.toUpperCase();

    // Check for known quantization patterns
    for (const quant of Object.keys(QUANTIZATION_INFO)) {
      if (upperName.includes(quant.replace('_', ''))) {
        return quant;
      }
      if (upperName.includes(quant)) {
        return quant;
      }
    }

    // Try to extract with regex
    const match = fileName.match(/[QqFf]\d+[_]?[KkMmSs]*/);
    if (match) {
      return match[0].toUpperCase();
    }

    return 'Unknown';
  }

  // Delegates to the single source of truth (src/services/mmproj.ts) so "is this a projector" is defined once.
  private isMMProjFile(fileName: string): boolean {
    return isMMProjFile(fileName);
  }

  // Routes through the single projector-rule owner (src/services/mmproj.ts). Quant is NOT a matching
  // signal (one projector serves every quant of its model); a projector whose filename names a DIFFERENT
  // model+variant is the wrong architecture and is REFUSED, so the model downloads with its correct
  // projector or text-only rather than being mispaired (#510). See pickMmProjForDownload for the rule.
  private findMatchingMMProj(
    modelFileName: string,
    mmProjFiles: Array<{ path: string; size?: number; lfs?: { size: number } }>,
    modelId: string
  ): { name: string; size: number; downloadUrl: string } | undefined {
    const chosen = pickMmProjForDownload(
      modelFileName,
      mmProjFiles.map(f => f.path)
    );
    if (!chosen) return undefined;

    const file = mmProjFiles.find(f => f.path === chosen);
    if (!file) return undefined;
    return {
      name: file.path,
      size: file.lfs?.size || file.size || 0,
      downloadUrl: this.getDownloadUrl(modelId, file.path),
    };
  }

  private detectModelType(name: string, tags: string[]): string {
    if (tags.some(t => t.includes('code')) || name.includes('code') || name.includes('coder'))
      return 'Code generation';
    // Single source of truth (utils/visionModel) — was a 3-keyword subset that missed Pixtral/
    // Moondream/InternVL etc. (DR2).
    if (looksLikeVisionModel({ name, tags }))
      return 'Vision';
    return 'Text generation';
  }

  private extractDescription(result: HFModelSearchResult): string {
    const name = (result.id.split('/').pop() || '').toLowerCase();
    const tags = result.tags?.map(t => t.toLowerCase()) || [];
    const author = result.author || result.id.split('/')[0] || '';
    const type = this.detectModelType(name, tags);
    const paramMatch = name.match(/(\d+\.?\d*)\s*b(?:\b|-)/);
    const paramStr = paramMatch ? `${paramMatch[1]}B` : null;
    const license = result.cardData?.license;
    const licenseStr = license ? license.toUpperCase().replaceAll('-', ' ') : null;
    const parts: string[] = [type];
    if (paramStr) parts.push(paramStr);
    if (licenseStr) parts.push(licenseStr);
    if (author) parts.push(`by ${author}`);
    return parts.join(' · ');
  }

  formatFileSize(bytes: number): string {
    if (bytes === 0) return '0 B';

    const units = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));

    return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
  }

  getQuantizationInfo(quantization: string) {
    return QUANTIZATION_INFO[quantization] || {
      bitsPerWeight: 4.5,
      quality: 'Unknown',
      description: 'Unknown quantization level',
      recommended: false,
    };
  }

}

export const huggingFaceService = new HuggingFaceService();
