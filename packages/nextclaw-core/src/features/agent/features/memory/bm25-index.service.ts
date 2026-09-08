/**
 * BM25 (Best Matching 25) retrieval for memory search.
 * Lightweight pure-JS implementation without external dependencies.
 */

export type Bm25Document = {
  id: string;
  content: string;
  path?: string;
  score?: number;
};

export type Bm25Params = {
  k1?: number;
  b?: number;
};

const DEFAULT_K1 = 1.5;
const DEFAULT_B = 0.75;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

export class Bm25Index {
  private documents: Bm25Document[] = [];
  private invertedIndex = new Map<string, Array<{ docId: string; termFreq: number }>>();
  private docLens = new Map<string, number>();
  private avgDocLen = 0;
  private docCount = 0;

  constructor(private params: Bm25Params = {}) {
    const { k1 = DEFAULT_K1, b = DEFAULT_B } = this.params;
    Object.assign(this.params, { k1, b });
  }

  addDocument = (doc: Bm25Document): void => {
    this.documents.push(doc);
    const tokens = tokenize(doc.content);
    const docId = doc.id;
    this.docLens.set(docId, tokens.length);
    const tf = new Map<string, number>();
    for (const token of tokens) {
      tf.set(token, (tf.get(token) ?? 0) + 1);
    }
    for (const [term, termFreq] of tf) {
      const postings = this.invertedIndex.get(term) ?? [];
      postings.push({ docId, termFreq });
      this.invertedIndex.set(term, postings);
    }
    this.docCount += 1;
    this.avgDocLen =
      this.avgDocLen * ((this.docCount - 1) / this.docCount) + tokens.length / this.docCount;
  }

  removeDocument = (docId: string): void => {
    const idx = this.documents.findIndex((d) => d.id === docId);
    if (idx === -1) return;
    this.documents.splice(idx, 1);
    const tokens = tokenize(this.documents[idx]?.content ?? '');
    // Rebuild index for simplicity
    this.rebuild();
  }

  private rebuild = (): void => {
    this.invertedIndex.clear();
    this.docLens.clear();
    let totalLen = 0;
    for (const doc of this.documents) {
      const tokens = tokenize(doc.content);
      this.docLens.set(doc.id, tokens.length);
      totalLen += tokens.length;
      const tf = new Map<string, number>();
      for (const token of tokens) {
        tf.set(token, (tf.get(token) ?? 0) + 1);
      }
      for (const [term, termFreq] of tf) {
        const postings = this.invertedIndex.get(term) ?? [];
        postings.push({ docId: doc.id, termFreq });
        this.invertedIndex.set(term, postings);
      }
    }
    this.docCount = this.documents.length;
    this.avgDocLen = this.docCount > 0 ? totalLen / this.docCount : 0;
  }

  search = (query: string, k: number = 10): Bm25Document[] => {
    if (this.docCount === 0) return [];
    const tokens = tokenize(query);
    if (tokens.length === 0) return [];

    const scores = new Map<string, number>();
    const k1 = this.params.k1 ?? DEFAULT_K1;
    const b = this.params.b ?? DEFAULT_B;

    for (const token of tokens) {
      const postings = this.invertedIndex.get(token);
      if (!postings || postings.length === 0) continue;
      for (const { docId, termFreq } of postings) {
        const docLen = this.docLens.get(docId) ?? 0;
        const idf = Math.log(
          1 + (this.docCount - postings.length + 0.5) / (postings.length + 0.5),
        );
        const numerator = termFreq * (k1 + 1);
        const denominator =
          termFreq + k1 * (1 - b + b * (docLen / this.avgDocLen));
        const tfScore = numerator / denominator;
        scores.set(docId, (scores.get(docId) ?? 0) + idf * tfScore);
      }
    }

    return this.documents
      .map((doc) => ({ ...doc, score: scores.get(doc.id) ?? 0 }))
      .filter((doc) => doc.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }
}
