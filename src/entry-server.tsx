import { Writable } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom';
import { AppRoutes } from './App';
import './i18n';

/**
 * Build-time prerender of a single route to an HTML string. Uses
 * renderToPipeableStream + onAllReady so all Suspense/lazy route chunks resolve
 * before we capture the markup (i.e. the real page, not the loading fallback).
 * Component effects don't run on the server, so pages render against their
 * DEFAULTS — exactly the static content we want; live Firestore data hydrates
 * on the client.
 */
export function render(url: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    const writable = new Writable({
      write(chunk, _enc, cb) {
        chunks.push(Buffer.from(chunk));
        cb();
      },
      final(cb) {
        resolve(Buffer.concat(chunks).toString('utf8'));
        cb();
      },
    });

    const { pipe } = renderToPipeableStream(
      <StaticRouter location={url}>
        <AppRoutes />
      </StaticRouter>,
      {
        onAllReady() {
          pipe(writable);
        },
        onError(err) {
          reject(err);
        },
      },
    );
  });
}
