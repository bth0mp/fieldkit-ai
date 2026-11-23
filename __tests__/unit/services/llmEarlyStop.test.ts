/**
 * A Stop pressed before the native completion starts must stop the reply.
 *
 * llama.rn clears a stop when a completion starts, so a Stop that arrives while the turn is still
 * preparing its messages used to be lost: the reply then ran to the end, and Stop waited for all of it.
 * The phone is the boundary: the llama.rn context is faked, the llm service runs for real.
 */
import { initLlama } from 'llama.rn';
import RNFS from 'react-native-fs';
import { llmService } from '../../../src/services/llm';
import { resetStores, createMockLlamaContext } from '../../utils/testHelpers';
import { createUserMessage } from '../../utils/factories';

const mockedInitLlama = initLlama as jest.MockedFunction<typeof initLlama>;
const mockedRNFS = RNFS as jest.Mocked<typeof RNFS>;

const TOOLS = [{ type: 'function', function: { name: 'calculator', parameters: { type: 'object', properties: {} } } }];

async function loadModel(overrides: Record<string, any> = {}) {
  mockedRNFS.exists.mockResolvedValue(true);
  const ctx = createMockLlamaContext(overrides);
  mockedInitLlama.mockResolvedValue(ctx as any);
  await llmService.loadModel('/models/test.gguf');
  return ctx;
}

describe('a Stop that lands around the start of a completion', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    jest.restoreAllMocks();
    mockedRNFS.stat.mockResolvedValue({ size: 1000000, isFile: () => true } as any);
    resetStores();
    await llmService.unloadModel();
  });

  it('stops the reply before it starts, with no completion run', async () => {
    const ctx = await loadModel();

    const reply = llmService.generateResponse([createUserMessage('Tell me a story')]).catch(() => '');
    await llmService.stopGeneration(); // lands while the turn is still preparing its messages
    const answer = await reply;

    expect(answer).toBe('');
    expect(ctx.completion).not.toHaveBeenCalled();
    expect(llmService.isCurrentlyGenerating()).toBe(false);
  });

  it('stops a tool turn before it starts and reports it as interrupted', async () => {
    const ctx = await loadModel();

    const turn = llmService.generateResponseWithTools([createUserMessage('What is 7 * 7?')], { tools: TOOLS });
    await llmService.stopGeneration();
    const result = await turn;

    expect(ctx.completion).not.toHaveBeenCalled();
    expect(result.interrupted).toBe(true);
    expect(result.fullResponse).toBe('');
    expect(llmService.isCurrentlyGenerating()).toBe(false);
  });

  it('runs the next reply normally after an early Stop', async () => {
    const ctx = await loadModel();
    const first = llmService.generateResponse([createUserMessage('First')]).catch(() => '');
    await llmService.stopGeneration();
    await first;

    (ctx.completion as jest.Mock).mockImplementation((_p: any, cb: any) => {
      cb({ token: 'Second answer' });
      return Promise.resolve({ text: 'Second answer' });
    });
    expect(await llmService.generateResponse([createUserMessage('Second')])).toBe('Second answer');
  });

  it('sends the Stop again when it lands as the completion starts, and a token after it never throws', async () => {
    let onToken: (data: any) => void = () => {};
    let finish: (v: any) => void = () => {};
    // llama.rn types stopCompletion() as a Promise but its JSI returns undefined.
    const stopCompletion = jest.fn(() => undefined as any);
    const ctx = await loadModel({
      stopCompletion,
      completion: jest.fn((_p: any, cb: any) => { onToken = cb; return new Promise(r => { finish = r; }); }),
    });

    const reply = llmService.generateResponse([createUserMessage('Go')]);
    while (ctx.completion.mock.calls.length === 0) await new Promise<void>(r => setImmediate(r));
    const stopping = llmService.stopGeneration();
    expect(stopCompletion).toHaveBeenCalledTimes(1);

    expect(() => onToken({ token: 'late' })).not.toThrow(); // queued before the Stop took hold
    expect(stopCompletion).toHaveBeenCalledTimes(2); // the Stop that the start of the completion cleared
    onToken({ token: 'later' });
    expect(stopCompletion).toHaveBeenCalledTimes(2); // resent once, not per token

    finish({ text: 'late later', interrupted: true });
    await stopping;
    await reply;
  });

  it('an unload that lands while the turn is preparing stops it, and the next turn runs', async () => {
    const ctx = await loadModel();

    const reply = llmService.generateResponse([createUserMessage('Tell me a story')]).catch(() => '');
    await llmService.unloadModel(); // lands while the turn is still preparing its messages
    const answer = await reply;

    expect(answer).toBe('');
    expect(ctx.completion).not.toHaveBeenCalled();
    expect(llmService.isModelLoaded()).toBe(false);
    expect(llmService.isCurrentlyGenerating()).toBe(false);

    const next = await loadModel({
      completion: jest.fn((_p: any, cb: any) => {
        cb({ token: 'Back again' });
        return Promise.resolve({ text: 'Back again' });
      }),
    });
    expect(await llmService.generateResponse([createUserMessage('Hello')])).toBe('Back again');
    expect(next.completion).toHaveBeenCalledTimes(1);
  });
});
