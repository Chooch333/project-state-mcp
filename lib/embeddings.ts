// OpenAI embeddings helper.
// Uses text-embedding-3-small (1536 dimensions) for compact, cheap embeddings
// suitable for semantic search over project-state rows.
//
// If OPENAI_API_KEY is not set, returns null and writes proceed without embeddings —
// semantic search will simply return no results for the missing-embedding rows,
// keyword search (trigram) still works.

const MODEL = 'text-embedding-3-small';
const API = 'https://api.openai.com/v1/embeddings';

export async function embed(text: string): Promise<number[] | null> {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !text?.trim()) return null;

  try {
    const res = await fetch(API, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        // OpenAI limit is ~8k tokens; truncate conservatively to keep latency low.
        input: text.slice(0, 16000),
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error(`Embedding API error ${res.status}: ${errText.slice(0, 300)}`);
      return null;
    }

    const data: any = await res.json();
    const vector = data?.data?.[0]?.embedding;
    return Array.isArray(vector) ? vector : null;
  } catch (e: any) {
    console.error('Embedding generation failed:', e.message);
    return null;
  }
}

// pgvector accepts the literal string "[n1,n2,...]" on insert via its text format.
// Returns null if no embedding available (column accepts null).
export function toPgVector(embedding: number[] | null): string | null {
  if (!embedding || embedding.length === 0) return null;
  return `[${embedding.join(',')}]`;
}

// Compose the text to embed for different entity types — the goal is one string
// that captures the semantic meaning of the row.
export const composeEmbeddingText = {
  decision: (title: string, rationale: string, alternatives?: string | null) =>
    [title, rationale, alternatives].filter(Boolean).join('\n\n'),
  assumption: (statement: string, alternatives?: string | null) =>
    [statement, alternatives].filter(Boolean).join('\n\n'),
  blocker: (question: string, context?: string | null) =>
    [question, context].filter(Boolean).join('\n\n'),
  nextMove: (description: string) => description,
  plan: (title: string, content: string) => `${title}\n\n${content.slice(0, 8000)}`,
  snapshot: (narrative: string) => narrative,
  note: (content: string, topic?: string | null) =>
    topic ? `[${topic}] ${content}` : content,
  lesson: (situation: string, lesson: string, appliesTo?: string | null) =>
    [situation, lesson, appliesTo ? `Applies to: ${appliesTo}` : null].filter(Boolean).join('\n\n'),
};
