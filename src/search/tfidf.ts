/**
 * Self-contained TF-IDF search engine with cosine similarity.
 * Zero external dependencies — tokenization, indexing, and scoring are all built-in.
 */

const STOPWORDS = new Set([
  'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being',
  'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
  'should', 'may', 'might', 'can', 'shall', 'must',
  'in', 'on', 'at', 'to', 'for', 'of', 'with', 'from', 'by', 'as',
  'and', 'or', 'but', 'not', 'nor', 'so', 'yet',
  'this', 'that', 'these', 'those', 'it', 'its',
  'if', 'then', 'than', 'when', 'where', 'how', 'what', 'which', 'who',
  'all', 'each', 'every', 'both', 'few', 'more', 'most', 'some', 'any',
  'no', 'only', 'own', 'same', 'such', 'too', 'very',
  'just', 'about', 'above', 'after', 'again', 'also', 'because', 'before',
  'between', 'during', 'into', 'through', 'under', 'until', 'while',
]);

interface DocumentVector {
  path: string;
  termFreqs: Map<string, number>;
  totalTerms: number;
  magnitude: number; // L2 norm of TF-IDF vector (computed lazily)
}

export class TfIdfIndex {
  private documents: Map<string, DocumentVector> = new Map();
  private documentFreqs: Map<string, number> = new Map();
  private totalDocuments = 0;
  private dirty = true; // whether magnitudes need recomputation

  /**
   * Build the index from a map of path -> content.
   */
  buildIndex(docs: Map<string, string>): void {
    this.documents.clear();
    this.documentFreqs.clear();
    this.totalDocuments = 0;

    for (const [path, content] of docs) {
      this.addDocumentInternal(path, content);
    }

    this.dirty = true;
  }

  /**
   * Add or update a single document in the index.
   */
  updateDocument(path: string, content: string): void {
    // Remove old document frequencies if exists
    this.removeDocumentInternal(path);
    this.addDocumentInternal(path, content);
    this.dirty = true;
  }

  /**
   * Remove a document from the index.
   */
  removeDocument(path: string): void {
    this.removeDocumentInternal(path);
    this.dirty = true;
  }

  /**
   * Search by query string. Returns scored results sorted by relevance.
   */
  search(query: string, limit: number): Array<{ path: string; score: number }> {
    const queryTokens = this.tokenize(query);
    if (queryTokens.length === 0) return [];

    this.ensureMagnitudes();

    // Build query term frequency map
    const queryFreqs = new Map<string, number>();
    for (const token of queryTokens) {
      queryFreqs.set(token, (queryFreqs.get(token) || 0) + 1);
    }

    const results: Array<{ path: string; score: number }> = [];

    for (const [path, doc] of this.documents) {
      const score = this.cosineSimilarityWithQuery(queryFreqs, queryTokens.length, doc);
      if (score > 0) {
        results.push({ path, score: Math.round(score * 10000) / 10000 });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Find documents similar to a given document.
   */
  findSimilar(path: string, limit: number): Array<{ path: string; score: number }> {
    const doc = this.documents.get(path);
    if (!doc) return [];

    this.ensureMagnitudes();

    const results: Array<{ path: string; score: number }> = [];

    for (const [otherPath, otherDoc] of this.documents) {
      if (otherPath === path) continue;
      const score = this.cosineSimilarityBetweenDocs(doc, otherDoc);
      if (score > 0) {
        results.push({ path: otherPath, score: Math.round(score * 10000) / 10000 });
      }
    }

    return results.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  /**
   * Tokenize text into normalized terms.
   */
  tokenize(text: string): string[] {
    // Strip markdown syntax
    let cleaned = text
      .replace(/```[\s\S]*?```/g, ' ')     // fenced code blocks
      .replace(/`[^`]+`/g, ' ')             // inline code
      .replace(/\[\[([^\]|]+)(\|[^\]]+)?\]\]/g, '$1') // wikilinks -> target text
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')        // markdown links -> text
      .replace(/^#{1,6}\s+/gm, '')           // heading markers
      .replace(/[*_~]+/g, ' ')              // emphasis markers
      .replace(/^---[\s\S]*?---/m, ' ')     // frontmatter
      .replace(/^>\s+/gm, ' ')              // blockquotes
      .replace(/[-|]+/g, ' ')               // table separators
      .toLowerCase();

    // Split on non-alphanumeric, filter stopwords and short tokens
    return cleaned
      .split(/[^a-z0-9]+/)
      .filter(token => token.length >= 2 && !STOPWORDS.has(token))
      .map(token => this.stem(token));
  }

  /**
   * Basic suffix stripping (lightweight stemmer).
   */
  private stem(word: string): string {
    if (word.length <= 3) return word;

    if (word.endsWith('ation')) return word.slice(0, -5);
    if (word.endsWith('tion')) return word.slice(0, -4);
    if (word.endsWith('ness')) return word.slice(0, -4);
    if (word.endsWith('ment')) return word.slice(0, -4);
    if (word.endsWith('able')) return word.slice(0, -4);
    if (word.endsWith('ible')) return word.slice(0, -4);
    if (word.endsWith('ing') && word.length > 5) return word.slice(0, -3);
    if (word.endsWith('ies') && word.length > 4) return word.slice(0, -3) + 'y';
    if (word.endsWith('ed') && word.length > 4) return word.slice(0, -2);
    if (word.endsWith('ly') && word.length > 4) return word.slice(0, -2);
    if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
    if (word.endsWith('s') && !word.endsWith('ss') && word.length > 3) return word.slice(0, -1);

    return word;
  }

  private addDocumentInternal(path: string, content: string): void {
    const tokens = this.tokenize(content);
    const termFreqs = new Map<string, number>();

    for (const token of tokens) {
      termFreqs.set(token, (termFreqs.get(token) || 0) + 1);
    }

    // Update document frequencies
    for (const term of termFreqs.keys()) {
      this.documentFreqs.set(term, (this.documentFreqs.get(term) || 0) + 1);
    }

    this.documents.set(path, {
      path,
      termFreqs,
      totalTerms: tokens.length,
      magnitude: 0,
    });

    this.totalDocuments++;
  }

  private removeDocumentInternal(path: string): void {
    const doc = this.documents.get(path);
    if (!doc) return;

    // Decrement document frequencies
    for (const term of doc.termFreqs.keys()) {
      const count = this.documentFreqs.get(term) || 0;
      if (count <= 1) {
        this.documentFreqs.delete(term);
      } else {
        this.documentFreqs.set(term, count - 1);
      }
    }

    this.documents.delete(path);
    this.totalDocuments--;
  }

  /**
   * Compute TF-IDF weight for a term in a document.
   */
  private tfidf(term: string, termFreq: number, totalTerms: number): number {
    const tf = termFreq / totalTerms;
    const df = this.documentFreqs.get(term) || 0;
    const idf = Math.log((this.totalDocuments + 1) / (df + 1));
    return tf * idf;
  }

  /**
   * Ensure all document magnitudes are computed.
   */
  private ensureMagnitudes(): void {
    if (!this.dirty) return;

    for (const doc of this.documents.values()) {
      let sumSq = 0;
      for (const [term, freq] of doc.termFreqs) {
        const w = this.tfidf(term, freq, doc.totalTerms);
        sumSq += w * w;
      }
      doc.magnitude = Math.sqrt(sumSq);
    }

    this.dirty = false;
  }

  /**
   * Cosine similarity between a query and a document.
   */
  private cosineSimilarityWithQuery(
    queryFreqs: Map<string, number>,
    queryTotalTerms: number,
    doc: DocumentVector,
  ): number {
    if (doc.magnitude === 0) return 0;

    let dotProduct = 0;
    let queryMagSq = 0;

    for (const [term, freq] of queryFreqs) {
      const qWeight = this.tfidf(term, freq, queryTotalTerms);
      queryMagSq += qWeight * qWeight;

      const docFreq = doc.termFreqs.get(term);
      if (docFreq) {
        const dWeight = this.tfidf(term, docFreq, doc.totalTerms);
        dotProduct += qWeight * dWeight;
      }
    }

    const queryMag = Math.sqrt(queryMagSq);
    if (queryMag === 0) return 0;

    return dotProduct / (queryMag * doc.magnitude);
  }

  /**
   * Cosine similarity between two documents.
   */
  private cosineSimilarityBetweenDocs(a: DocumentVector, b: DocumentVector): number {
    if (a.magnitude === 0 || b.magnitude === 0) return 0;

    let dotProduct = 0;

    // Iterate over the smaller document's terms for efficiency
    const [smaller, larger] = a.termFreqs.size <= b.termFreqs.size ? [a, b] : [b, a];

    for (const [term, freq] of smaller.termFreqs) {
      const otherFreq = larger.termFreqs.get(term);
      if (otherFreq) {
        const wSmaller = this.tfidf(term, freq, smaller.totalTerms);
        const wLarger = this.tfidf(term, otherFreq, larger.totalTerms);
        dotProduct += wSmaller * wLarger;
      }
    }

    return dotProduct / (a.magnitude * b.magnitude);
  }
}
