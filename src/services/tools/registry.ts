import { ToolDefinition } from './types';

export const AVAILABLE_TOOLS: ToolDefinition[] = [
  {
    id: 'web_search',
    name: 'web_search',
    displayName: 'Web Search',
    description: 'Search the live web and return real-time result titles, snippets, and URLs. Use this for any question about current events, prices, weather, news, or anything that requires up-to-date information. When the snippet is insufficient, call read_url on the most relevant result URL to get the full page content.',
    icon: 'globe',
    requiresNetwork: true,
    parameters: {
      query: {
        type: 'string',
        description: 'Search query',
        required: true,
      },
    },
  },
  {
    id: 'calculator',
    name: 'calculator',
    displayName: 'Calculator',
    description: 'Evaluate math expressions',
    icon: 'hash',
    parameters: {
      expression: {
        type: 'string',
        description: 'Math expression',
        required: true,
      },
    },
  },
  {
    id: 'get_current_datetime',
    name: 'get_current_datetime',
    displayName: 'Date & Time',
    description: 'Get current date and time',
    icon: 'clock',
    parameters: {
      timezone: {
        type: 'string',
        description: 'IANA timezone, e.g. America/New_York',
      },
    },
  },
  {
    id: 'get_device_info',
    name: 'get_device_info',
    displayName: 'Device Info',
    description: 'Get device hardware info',
    icon: 'smartphone',
    parameters: {
      info_type: {
        type: 'string',
        description: 'Info type',
        enum: ['battery', 'storage', 'memory', 'all'],
      },
    },
  },
  {
    id: 'search_knowledge_base',
    name: 'search_knowledge_base',
    displayName: 'Knowledge Base',
    description: "Search this project's guides, documents and Kiwix files",
    icon: 'book-open',
    parameters: {
      query: {
        type: 'string',
        description: 'Search query',
        required: true,
      },
    },
  },
  {
    id: 'read_url',
    name: 'read_url',
    displayName: 'URL Reader',
    description: 'Fetch the full live content of any URL. Use this after web_search to read the complete text of a result page, or directly when the user shares a link.',
    icon: 'link',
    requiresNetwork: true,
    parameters: {
      url: {
        type: 'string',
        description: 'Full URL to fetch',
        required: true,
      },
    },
  },
  {
    id: 'draft_email',
    name: 'draft_email',
    displayName: 'Email Draft',
    description: 'Open an email draft in the mail app. The user approves it first, then reviews and sends it from the mail app. Use this when the user asks you to write or send an email.',
    icon: 'mail',
    requiresApproval: true,
    parameters: {
      to: {
        type: 'string',
        description: 'Recipient email addresses, separated by commas',
      },
      subject: {
        type: 'string',
        description: 'Subject line',
        required: true,
      },
      body: {
        type: 'string',
        description: 'Plain-text message body',
        required: true,
      },
    },
  },
  {
    id: 'read_calendar_events',
    name: 'read_calendar_events',
    displayName: 'Calendar',
    description: "Read the events in the user's calendar between two times, at most 31 days apart. Use this when the user asks what is on their calendar or when they are free.",
    icon: 'calendar',
    handlesPrivateData: true,
    requiredModule: 'calendar',
    requiredPermission: 'calendar_read',
    userNote: 'Events are read on this phone and never sent anywhere. Hidden while a remote model is active.',
    parameters: {
      start: {
        type: 'string',
        description: 'Start of the range, ISO 8601 local time, e.g. 2026-11-06T00:00:00',
        required: true,
      },
      end: {
        type: 'string',
        description: 'End of the range, ISO 8601 local time, e.g. 2026-11-07T00:00:00',
        required: true,
      },
    },
  },
  {
    id: 'create_calendar_event',
    name: 'create_calendar_event',
    displayName: 'New Calendar Event',
    description: "Open a new event in the user's calendar app, filled in. The user approves it first, then saves or cancels it in the calendar app. Use this when the user asks you to add, book or schedule something.",
    icon: 'calendar',
    requiresApproval: true,
    requiredModule: 'calendar',
    parameters: {
      title: {
        type: 'string',
        description: 'Event title',
        required: true,
      },
      start: {
        type: 'string',
        description: 'Start, ISO 8601 local time, e.g. 2026-11-06T14:00:00',
        required: true,
      },
      end: {
        type: 'string',
        description: 'End, ISO 8601 local time, e.g. 2026-11-06T14:30:00',
        required: true,
      },
      location: {
        type: 'string',
        description: 'Where the event is',
      },
      notes: {
        type: 'string',
        description: 'Notes for the event',
      },
      all_day: {
        type: 'boolean',
        description: 'True for an all-day event',
      },
    },
  },
  {
    id: 'convert_units',
    name: 'convert_units',
    displayName: 'Unit Converter',
    // The LiteRT tool router reads only the first 100 characters of a description.
    description: 'Convert a value between units: length, mass, volume, temperature, speed, pressure, area, energy. Use this instead of converting in your head, e.g. miles to km, °F to °C, psi to kPa, gallons to litres.',
    icon: 'repeat',
    parameters: {
      value: {
        type: 'number',
        description: 'The number to convert',
        required: true,
      },
      from: {
        type: 'string',
        description: 'Unit to convert from, e.g. mi, lb, gal, F, psi',
        required: true,
      },
      to: {
        type: 'string',
        description: 'Unit to convert to, e.g. km, kg, L, C, kPa',
        required: true,
      },
    },
  },
];

export function getToolsAsOpenAISchema(enabledToolIds: string[]) {
  return AVAILABLE_TOOLS
    .filter(tool => enabledToolIds.includes(tool.id))
    .map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: 'object',
          properties: Object.fromEntries(
            Object.entries(tool.parameters).map(([key, param]) => [
              key,
              {
                type: param.type,
                description: param.description,
                ...(param.enum ? { enum: param.enum } : {}),
              },
            ]),
          ),
          required: Object.entries(tool.parameters)
            .filter(([_, param]) => param.required)
            .map(([key]) => key),
        },
      },
    }));
}

export function buildToolSystemPromptHint(enabledToolIds: string[]): string {
  const enabledTools = AVAILABLE_TOOLS.filter(t => enabledToolIds.includes(t.id));
  if (enabledTools.length === 0) return '';

  const toolList = enabledTools.map(t => `- ${t.name}: ${t.description}`).join('\n');
  return `\n\nTools available:\n${toolList}\nUse these tools proactively and precisely — call the right tool at the right moment rather than guessing or saying you cannot help.`;
}
