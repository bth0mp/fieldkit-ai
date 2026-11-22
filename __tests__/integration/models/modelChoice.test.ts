/**
 * Integration — the one service every change of the model in use goes through.
 *
 * Real activeModelService, residency manager, engines, generationService, stores and provider registry over the
 * faked native boundary (llama.rn, LiteRT, diffusion, filesystem). Each test boots its own module graph.
 */
import { installNativeBoundary, GB, requireRTL, type NativeBoundary } from '../../harness/nativeBoundary';
import { createDownloadedModel, createONNXImageModel } from '../../utils/factories';
import type { DownloadedModel } from '../../../src/types';

type Engine = 'llama' | 'litert';

let boundary: NativeBoundary;
let rtl: ReturnType<typeof requireRTL>;
let chooseTextModel: typeof import('../../../src/services/modelChoice').chooseTextModel;
let chooseRemoteTextModel: typeof import('../../../src/services/modelChoice').chooseRemoteTextModel;
let chooseImageModel: typeof import('../../../src/services/modelChoice').chooseImageModel;
let dropTextModel: typeof import('../../../src/services/modelChoice').dropTextModel;
let dropImageModel: typeof import('../../../src/services/modelChoice').dropImageModel;
let activeModelService: typeof import('../../../src/services/activeModelService').activeModelService;
let generationService: typeof import('../../../src/services/generationService').generationService;
let imageGenerationService: typeof import('../../../src/services/imageGenerationService').imageGenerationService;
let llmService: typeof import('../../../src/services/llm').llmService;
let liteRTService: typeof import('../../../src/services/litert').liteRTService;
let modelResidencyManager: typeof import('../../../src/services/modelResidency').modelResidencyManager;
let providerRegistry: typeof import('../../../src/services/providers').providerRegistry;
let isModelReady: typeof import('../../../src/services/engines').isModelReady;
let useActiveTextModel: typeof import('../../../src/hooks/useActiveTextModel').useActiveTextModel;
let useAppStore: typeof import('../../../src/stores').useAppStore;
let useChatStore: typeof import('../../../src/stores').useChatStore;
let useRemoteServerStore: typeof import('../../../src/stores').useRemoteServerStore;
let hardwareService: typeof import('../../../src/services/hardware').hardwareService;
let conversationId: string;

const state = () => useAppStore.getState();
const remote = () => useRemoteServerStore.getState();
const settle = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms));
const model = (id: string) => state().downloadedModels.find(m => m.id === id) as DownloadedModel;
const lastMessage = () => {
  const messages = useChatStore.getState().getConversationMessages(conversationId);
  return messages[messages.length - 1];
};
const make = (engine: string, id: string): DownloadedModel => createDownloadedModel({
  id, name: id, engine: engine as Engine, fileSize: 500 * 1024 * 1024,
  filePath: engine === 'litert' ? `/models/${id}.litertlm` : `/models/${id}.gguf`,
});
const litert = (id: string) => make('litert', id);

async function boot(models: DownloadedModel[]) {
  boundary = installNativeBoundary({ llama: true, fs: true, ram: { platform: 'android', totalBytes: 12 * GB, availBytes: 8 * GB } });
  rtl = requireRTL();
  ({ chooseTextModel, chooseRemoteTextModel, chooseImageModel, dropTextModel, dropImageModel } = require('../../../src/services/modelChoice'));
  ({ activeModelService } = require('../../../src/services/activeModelService'));
  ({ generationService } = require('../../../src/services/generationService'));
  ({ imageGenerationService } = require('../../../src/services/imageGenerationService'));
  ({ llmService } = require('../../../src/services/llm'));
  ({ liteRTService } = require('../../../src/services/litert'));
  ({ modelResidencyManager } = require('../../../src/services/modelResidency'));
  ({ providerRegistry } = require('../../../src/services/providers'));
  ({ isModelReady } = require('../../../src/services/engines'));
  ({ useActiveTextModel } = require('../../../src/hooks/useActiveTextModel'));
  ({ useAppStore, useChatStore, useRemoteServerStore } = require('../../../src/stores'));
  ({ hardwareService } = require('../../../src/services/hardware'));
  for (const m of models) boundary.fs!.seedFile(m.filePath, m.fileSize);
  await hardwareService.refreshMemoryInfo();
  useAppStore.setState({ downloadedModels: models, activeModelId: null });
  conversationId = useChatStore.getState().createConversation(models[0]?.id ?? 'a');
}

function addServer(id: string, modelIds: string[]) {
  useRemoteServerStore.setState(prev => ({
    servers: [...prev.servers, { id, name: id, endpoint: `http://${id}.local:1234`, providerType: 'openai-compatible', createdAt: 't' }],
    discoveredModels: {
      ...prev.discoveredModels,
      [id]: modelIds.map(m => ({
        id: m, name: m, serverId: id, lastUpdated: 't',
        capabilities: { supportsVision: false, supportsToolCalling: false, supportsThinking: false },
      })),
    },
  }));
}

/** The usual world: llama models a and b, a loaded, two servers, one image model. */
async function bootDefault() {
  await boot([make('llama', 'a'), make('llama', 'b')]);
  addServer('s1', ['x']);
  addServer('s2', ['y']);
  useAppStore.setState({ downloadedImageModels: [createONNXImageModel({ id: 'sd', modelPath: '/models/sd' })] });
  await activeModelService.loadTextModel('a');
}

/** Starts a reply on 'a' that is held after its first word. `finished` settles when the reply ends. */
function startReply() {
  boundary.llama!.scriptCompletion({ text: 'one two three', pauseAfter: 'one' });
  useChatStore.getState().addMessage(conversationId, { role: 'user', content: 'hi' });
  return generationService.generateResponse(conversationId, []);
}
async function replying() {
  const finished = startReply();
  await rtl.waitFor(() => expect(useChatStore.getState().streamingMessage).toContain('one'));
  return { finished };
}

describe('modelChoice', () => {
  it('LiteRT to LiteRT: the first is unloaded, so the second is not "ready"', async () => {
    await boot([litert('a'), litert('b')]); await activeModelService.loadTextModel('a');
    await chooseTextModel('b');
    expect([state().activeModelId, state().lastTextModelId, state().textModelEvicted]).toEqual(['b', 'b', false]);
    expect(isModelReady(model('b'))).toBe(false);
  });

  it.each([['llama', 'litert'], ['litert', 'llama'], ['llama', 'llama']])('%s to %s frees the first', async (from, to) => {
    await boot([make(from, 'a'), make(to, 'b')]); await activeModelService.loadTextModel('a');
    await chooseTextModel('b');
    expect(modelResidencyManager.getResidents().filter(r => r.type === 'text')).toEqual([]);
    expect([llmService.isModelLoaded(), liteRTService.isModelLoaded()]).toEqual([false, false]);
  });

  it('never passes through no model: local to local, local to remote, remote to remote, remote to local', async () => {
    await bootDefault();
    const seen: Array<string | null> = [];
    rtl.renderHook(() => { seen.push(useActiveTextModel().modelId); }); // what the chat sees, render by render
    await rtl.act(async () => { await chooseTextModel('b'); });
    await rtl.act(async () => { await chooseRemoteTextModel('s1', 'x'); });
    await rtl.act(async () => { await chooseRemoteTextModel('s2', 'y'); });
    await rtl.act(async () => { await chooseTextModel('a'); });
    expect(seen).not.toContain(null); expect(seen.at(-1)).toBe('a');
  });

  it('choosing the model in use leaves it loaded', async () => {
    await bootDefault();
    await chooseTextModel('a');
    expect(llmService.isModelLoaded()).toBe(true);
  });

  it('remote: unloads the local model and drops its choice', async () => {
    await bootDefault();
    await chooseRemoteTextModel('s1', 'x');
    expect([remote().activeServerId, remote().activeRemoteTextModelId, state().activeModelId]).toEqual(['s1', 'x', null]);
    expect(llmService.isModelLoaded()).toBe(false);
  });

  it('remote that cannot connect: says so and leaves the earlier choice and its model loaded', async () => {
    await bootDefault();
    await expect(chooseRemoteTextModel('gone', 'x')).rejects.toThrow();
    expect([remote().activeServerId, remote().activeRemoteTextModelId, state().activeModelId]).toEqual([null, null, 'a']);
    expect(llmService.isModelLoaded()).toBe(true);
    expect(providerRegistry.getActiveProviderId()).toBe('local');
  });

  it('the same, with another remote model in use: that one and its provider come back', async () => {
    await bootDefault();
    await chooseRemoteTextModel('s1', 'x'); await expect(chooseRemoteTextModel('gone', 'x')).rejects.toThrow();
    expect([remote().activeServerId, remote().activeRemoteTextModelId, providerRegistry.getActiveProviderId()]).toEqual(['s1', 'x', 's1']);
  });

  it('image: marks it and leaves the text model alone', async () => {
    await bootDefault();
    await chooseImageModel('sd');
    expect([state().activeImageModelId, state().activeModelId, llmService.isModelLoaded()]).toEqual(['sd', 'a', true]);
  });

  it.each(['local', 'remote'])('drop, %s text: nothing in use and nothing loaded', async (kind) => {
    await bootDefault();
    if (kind === 'remote') await chooseRemoteTextModel('s1', 'x');
    await dropTextModel();
    expect([state().activeModelId, remote().activeServerId, remote().activeRemoteTextModelId, llmService.isModelLoaded()]).toEqual([null, null, null, false]);
  });

  it('drop, image: no image model in use, the text model untouched', async () => {
    await bootDefault();
    await chooseImageModel('sd');
    await dropImageModel(); expect([state().activeImageModelId, state().activeModelId]).toEqual([null, 'a']);
  });

  it('stops the reply being written and keeps what it wrote', async () => {
    await bootDefault();
    await replying(); await chooseTextModel('b');
    expect(generationService.getState().isGenerating).toBe(false);
    expect(lastMessage().content).toContain('one');
  });

  it('a message queued behind the reply goes out once, after the switch', async () => {
    await bootDefault();
    const sentTo: Array<string | null> = [];
    generationService.setQueueProcessor(async () => { sentTo.push(state().activeModelId); });
    await replying();
    generationService.enqueueMessage({ id: 'q', conversationId, text: 'next', messageText: 'next' });
    await chooseTextModel('b');
    await rtl.waitFor(() => expect(sentTo).toEqual(['b']));
    await settle(300); expect(sentTo).toEqual(['b']);
  });

  it('a message waiting while two choices follow each other goes out once, after the last', async () => {
    await boot([make('llama', 'a'), make('llama', 'b'), make('llama', 'c')]);
    await activeModelService.loadTextModel('a');
    const sentTo: Array<string | null> = [];
    generationService.setQueueProcessor(async () => { sentTo.push(state().activeModelId); });
    await replying();
    generationService.enqueueMessage({ id: 'q', conversationId, text: 'next', messageText: 'next' });
    await Promise.all([chooseTextModel('b'), chooseTextModel('c')]);
    await rtl.waitFor(() => expect(sentTo).toEqual(['c']));
    await settle(300); expect(sentTo).toEqual(['c']);
  });

  it('a message still being prepared: the switch waits for its reply to start, stops it, and the choice stands', async () => {
    await bootDefault();
    const turn = generationService.runTurn(async () => {
      await settle(200); await activeModelService.loadTextModel('a');
      await startReply(); // the switch stops it as soon as it is writing, which can be before its first word
    });
    await chooseTextModel('b'); await turn;
    expect([state().activeModelId, generationService.getState().isGenerating]).toEqual(['b', false]);
  });

  it('choosing a text model leaves a picture being made running', async () => {
    await bootDefault();
    useAppStore.setState({ activeImageModelId: 'sd' });
    useAppStore.getState().updateSettings({ imageThreads: 4, imageUseOpenCL: false, enhanceImagePrompts: false });
    boundary.diffusion.module.getLoadedModelPath.mockResolvedValue('/models/sd');
    await require('../../../src/services/localDreamGenerator').localDreamGeneratorService.loadModel('/models/sd', 4, {});
    boundary.diffusion.module.generateImage.mockImplementation(() => new Promise(() => { /* held: the picture never finishes */ }));
    imageGenerationService.generateImage({ prompt: 'a cat', conversationId }).catch(() => { });
    await rtl.waitFor(() => expect(imageGenerationService.getState().isGenerating).toBe(true));
    await chooseTextModel('b');
    expect(imageGenerationService.getState().isGenerating).toBe(true);
  });

  it('two choices at once: they run in turn and the last one is in use', async () => {
    await bootDefault();
    const trace: string[] = [];
    const note = () => {
      const entry = `${remote().activeServerId}|${state().activeModelId}`;
      if (trace.at(-1) !== entry) trace.push(entry);
    };
    useRemoteServerStore.subscribe(note); useAppStore.subscribe(note);
    await Promise.all([chooseTextModel('b'), chooseRemoteTextModel('s1', 'x'), chooseTextModel('a')]);
    expect([remote().activeServerId, state().activeModelId]).toEqual([null, 'a']);
    // each choice completes before the next starts: b, then the remote model (which drops b), then a
    expect(trace).toEqual(['null|a', 'null|b', 's1|b', 's1|null', 's1|a', 'null|a']);
  });
});
