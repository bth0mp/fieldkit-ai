/**
 * HAPPY-PATH (UI integration, HEAVY entry point) — a built-in tool runs end to end: with the calculator
 * tool enabled, the user asks a question, the model emits a tool call, the REAL calculator executes, and
 * the user sees the tool-result bubble + the model's answer.
 *
 * Real ChatScreen + real generationToolLoop + real calculator tool + real engine; only the native LiteRT
 * leaf is faked. This is the green complement to the Q2/Q3/Q5 tool red-flows.
 */
import { setupChatScreen } from '../../harness/chatHarness';

jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: () => {}, goBack: () => {}, setOptions: () => {}, addListener: () => () => {} }),
  useRoute: () => require('../../harness/chatHarness').routeHolder,
  useFocusEffect: () => {},
  useIsFocused: () => true,
}));

describe('happy — a tool runs and its result renders (heavy entry point)', () => {
  it('calculator: tool call executes and the answer renders', async () => {
    const h = await setupChatScreen({ engine: 'litert' });
    // Arrive-via-UI: enable the calculator on the real Tools screen (flip its switch), then chat.
    h.enableToolViaUI('calculator');
    h.render();

    // The model emits a calculator tool call; after the tool runs it answers with the result.
    await h.send('what is 2 + 2', { toolCalls: [{ name: 'calculator', arguments: { expression: '2+2' } }], content: 'The answer is 4.' });

    // The user sees the tool-result bubble (the calculator actually ran)...
    await h.rtl.waitFor(() => { expect(h.view!.queryByTestId('tool-result-label-calculator')).not.toBeNull(); });
    // ...and the model's final answer.
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/The answer is 4\./)).not.toBeNull(); });
  });

  it('T044: two parallel calculator calls render two tool-result bubbles, both correct', async () => {
    const h = await setupChatScreen({ engine: 'litert' });
    h.enableToolViaUI('calculator');
    h.render();
    // The model emits TWO calculator tool calls in one turn (parallel, index 0+1); the real tool loop runs
    // both and the answer carries both results.
    await h.send('compute 500*321 and 12+13', {
      toolCalls: [
        { name: 'calculator', arguments: { expression: '500*321' } },
        { name: 'calculator', arguments: { expression: '12+13' } },
      ],
      content: 'Results: 160500 and 25.',
    });
    // Two tool-result bubbles render (both calculator runs are visible).
    await h.rtl.waitFor(() => { expect(h.view!.queryAllByTestId('tool-result-label-calculator').length).toBe(2); });
    // ...and the answer with both results renders.
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/160500 and 25/)).not.toBeNull(); });
  });

  it('show generation details: the details row renders when enabled', async () => {
    const h = await setupChatScreen({ engine: 'litert' });
    h.enableGenerationDetailsViaUI(); // real segmented toggle
    h.render();
    await h.send('hello', { content: 'Hi there.' });
    await h.rtl.waitFor(() => { expect(h.view!.queryByText(/Hi there\./)).not.toBeNull(); });
    // With details on, the model name is shown in the per-message details, as well as in the chat header.
    expect(h.view!.queryAllByText(/Test Model/)).toHaveLength(2);
  });
});
