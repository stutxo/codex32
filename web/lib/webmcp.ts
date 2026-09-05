import { validateSelection, type ShareIndex } from './practice.ts';

export function recoveryTool(
  action: (indices: ShareIndex[]) => Promise<unknown>,
) {
  return {
    name: 'recover_public_practice',
    title: 'Recover the public Codex32 example',
    description:
      'Recover the published BIP93 example from two of A, C, D, and show its secret and checked Signet addresses. Accepts only built-in public examples.',
    inputSchema: {
      type: 'object',
      properties: {
        shareIndices: {
          type: 'array',
          items: { type: 'string', enum: ['A', 'C', 'D'] },
          minItems: 2,
          maxItems: 2,
          uniqueItems: true,
        },
      },
      required: ['shareIndices'],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, untrustedContentHint: false },
    execute(input: unknown) {
      if (
        !input ||
        typeof input !== 'object' ||
        Object.keys(input).length !== 1 ||
        !('shareIndices' in input)
      ) {
        throw new Error(
          'Provide only shareIndices, containing two different public practice indices.',
        );
      }
      return action(validateSelection(input.shareIndices));
    },
  };
}

declare global {
  interface Document {
    modelContext?: {
      registerTool(
        tool: ReturnType<typeof recoveryTool>,
        options?: { signal?: AbortSignal },
      ): void | Promise<void>;
    };
  }
}
