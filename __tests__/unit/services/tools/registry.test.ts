/**
 * Tool Registry Unit Tests
 *
 * Tests for AVAILABLE_TOOLS, getToolsAsOpenAISchema(), and buildToolSystemPromptHint().
 * Priority: P1 (High) - Tool registry drives tool-calling feature behavior.
 */

import {
  AVAILABLE_TOOLS,
  getToolsAsOpenAISchema,
  buildToolSystemPromptHint,
} from '../../../../src/services/tools/registry';

describe('Tool Registry', () => {
  // ========================================================================
  // AVAILABLE_TOOLS
  // ========================================================================
  describe('AVAILABLE_TOOLS', () => {
    it('has exactly 12 tools with correct IDs', () => {
      expect(AVAILABLE_TOOLS).toHaveLength(12);

      const ids = AVAILABLE_TOOLS.map(t => t.id);
      expect(ids).toEqual([
        'web_search',
        'calculator',
        'get_current_datetime',
        'get_device_info',
        'search_knowledge_base',
        'read_url',
        'draft_email',
        'read_calendar_events',
        'create_calendar_event',
        'convert_units',
        'convert_coordinates',
        'sun_times',
      ]);
    });

    it('sun_times says what it gives within the 100 characters the LiteRT tool router reads', () => {
      const tool = AVAILABLE_TOOLS.find(t => t.id === 'sun_times')!;
      const routed = tool.description.split('\n')[0].slice(0, 100);
      for (const word of ['Sunrise', 'sunset', 'twilight']) expect(routed).toContain(word);
      // Only the place is required: the day and the clock offset default to the phone's own.
      expect(Object.entries(tool.parameters).filter(([, p]) => p.required).map(([k]) => k)).toEqual(['position']);
      expect(Object.keys(tool.parameters)).toEqual(['position', 'date', 'utc_offset']);
    });

    it('convert_coordinates names its three forms within the 100 characters the LiteRT tool router reads', () => {
      const tool = AVAILABLE_TOOLS.find(t => t.id === 'convert_coordinates')!;
      const routed = tool.description.split('\n')[0].slice(0, 100);
      for (const form of ['latitude', 'UTM', 'MGRS']) expect(routed).toContain(form);
      expect(Object.entries(tool.parameters).filter(([, p]) => p.required).map(([k]) => k)).toEqual(['position']);
    });

    it('convert_units says what it converts within the 100 characters the LiteRT tool router reads', () => {
      const tool = AVAILABLE_TOOLS.find(t => t.id === 'convert_units')!;
      const routed = tool.description.split('\n')[0].slice(0, 100);
      for (const kind of ['length', 'mass', 'volume', 'temperature', 'speed', 'pressure', 'area', 'energy']) {
        expect(routed).toContain(kind);
      }
      expect(Object.entries(tool.parameters).filter(([, p]) => p.required).map(([k]) => k)).toEqual(['value', 'from', 'to']);
    });

    it('only draft_email and create_calendar_event require approval of every call', () => {
      const approval = Object.fromEntries(AVAILABLE_TOOLS.map(t => [t.id, t.requiresApproval === true]));
      expect(approval).toEqual({
        web_search: false,
        calculator: false,
        get_current_datetime: false,
        get_device_info: false,
        search_knowledge_base: false,
        read_url: false,
        draft_email: true,
        read_calendar_events: false,
        create_calendar_event: true,
        convert_units: false,
        convert_coordinates: false,
        sun_times: false,
      });
    });

    it('only read_calendar_events handles private data', () => {
      const privateData = AVAILABLE_TOOLS.filter(t => t.handlesPrivateData === true).map(t => t.id);
      expect(privateData).toEqual(['read_calendar_events']);
    });

    it('each tool has required fields (id, name, displayName, description, icon, parameters)', () => {
      for (const tool of AVAILABLE_TOOLS) {
        expect(tool.id).toBeTruthy();
        expect(typeof tool.id).toBe('string');
        expect(tool.name).toBeTruthy();
        expect(typeof tool.name).toBe('string');
        expect(tool.displayName).toBeTruthy();
        expect(typeof tool.displayName).toBe('string');
        expect(tool.description).toBeTruthy();
        expect(typeof tool.description).toBe('string');
        expect(tool.icon).toBeTruthy();
        expect(typeof tool.icon).toBe('string');
        expect(tool.parameters).toBeDefined();
        expect(typeof tool.parameters).toBe('object');
      }
    });
  });

  // ========================================================================
  // getToolsAsOpenAISchema
  // ========================================================================
  describe('getToolsAsOpenAISchema', () => {
    it('returns correct OpenAI format for given tool IDs', () => {
      const schema = getToolsAsOpenAISchema(['calculator']);

      expect(schema).toHaveLength(1);
      expect(schema[0]).toEqual({
        type: 'function',
        function: {
          name: 'calculator',
          description: 'Evaluate math expressions',
          parameters: {
            type: 'object',
            properties: {
              expression: {
                type: 'string',
                description: 'Math expression',
              },
            },
            required: ['expression'],
          },
        },
      });
    });

    it('filters to only enabled tools', () => {
      const schema = getToolsAsOpenAISchema(['calculator', 'get_current_datetime']);

      expect(schema).toHaveLength(2);
      const names = schema.map(s => s.function.name);
      expect(names).toEqual(['calculator', 'get_current_datetime']);
    });

    it('returns empty array for no matches', () => {
      const schema = getToolsAsOpenAISchema(['nonexistent_tool']);

      expect(schema).toEqual([]);
    });

    it('includes required parameters correctly', () => {
      const schema = getToolsAsOpenAISchema(['web_search']);

      expect(schema[0].function.parameters.required).toEqual(['query']);

      // Non-required parameters should not appear in required array
      const datetimeSchema = getToolsAsOpenAISchema(['get_current_datetime']);
      expect(datetimeSchema[0].function.parameters.required).toEqual([]);
    });

    it('includes enum values when present in parameters', () => {
      const schema = getToolsAsOpenAISchema(['get_device_info']);

      const infoType = schema[0].function.parameters.properties.info_type;
      expect(infoType.enum).toEqual(['battery', 'storage', 'memory', 'all']);

      // Tools without enums should not have the enum key
      const calcSchema = getToolsAsOpenAISchema(['calculator']);
      const expressionProp = calcSchema[0].function.parameters.properties.expression;
      expect(expressionProp).not.toHaveProperty('enum');
    });
  });

  // ========================================================================
  // buildToolSystemPromptHint
  // ========================================================================
  describe('buildToolSystemPromptHint', () => {
    it('returns empty string for empty array', () => {
      const hint = buildToolSystemPromptHint([]);

      expect(hint).toBe('');
    });

    it('returns empty string for non-matching IDs', () => {
      const hint = buildToolSystemPromptHint(['nonexistent_tool', 'another_fake']);

      expect(hint).toBe('');
    });

    it('includes tool names and descriptions for enabled tools', () => {
      const hint = buildToolSystemPromptHint(['calculator', 'web_search']);

      expect(hint).toContain('- calculator: Evaluate math expressions');
      expect(hint).toContain('- web_search: Search the live web');
      expect(hint).toContain('Tools available');
    });

    it('only includes enabled tools, not all tools', () => {
      const hint = buildToolSystemPromptHint(['calculator']);

      expect(hint).toContain('calculator: Evaluate math expressions');
      expect(hint).not.toContain('web_search');
      expect(hint).not.toContain('get_current_datetime');
      expect(hint).not.toContain('get_device_info');
    });

    it('includes read_url when read_url is enabled', () => {
      const hint = buildToolSystemPromptHint(['read_url']);
      expect(hint).toContain('read_url');
      expect(hint).toContain('result page');
    });

    it('includes get_current_datetime when enabled', () => {
      const hint = buildToolSystemPromptHint(['get_current_datetime']);
      expect(hint).toContain('get_current_datetime');
      expect(hint).toContain('date and time');
    });
  });
});
