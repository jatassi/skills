// Lazy loading of a block's library chunk from the server.

/**
 * A loader for the chunk at `url` (e.g. `/assets/mermaid.js`): the first call
 * imports it, later calls share that import, and a failed import is tried
 * again on the next call. The URL is only known at run time, so the chunk
 * stays out of the page bundle.
 */
export function chunkLoader<T>(url: string): () => Promise<T> {
  let chunk: Promise<T> | undefined;
  return () => {
    chunk ??= (import(url) as Promise<T>).catch((error: unknown) => {
      chunk = undefined;
      throw error;
    });
    return chunk;
  };
}
