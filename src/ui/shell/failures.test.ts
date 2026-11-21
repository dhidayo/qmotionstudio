import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  designFailureMessage, exportFailureMessage, isChunkLoadError, isMemoryError, isQuotaError,
  mediaSaveFailureMessage, MP4_FALLBACK, saveFailureMessage, windowFailureMessage,
} from './failures';

/** What IndexedDB rejects with when the device is full. Node has DOMException too. */
const quota = (): DOMException => new DOMException('The quota has been exceeded.', 'QuotaExceededError');

function online(on: boolean): void {
  vi.stubGlobal('navigator', { onLine: on });
}

afterEach(() => { vi.unstubAllGlobals(); });

describe('telling the causes apart (D-171)', () => {
  it('knows a full device by name, by message, and through a cause', () => {
    expect(isQuotaError(quota())).toBe(true);
    expect(isQuotaError(new Error('Encountered full disk while opening backing store'))).toBe(true);
    expect(isQuotaError(new Error('Could not save.', { cause: quota() }))).toBe(true);
    expect(isQuotaError(new Error('Transaction aborted'))).toBe(false);
    expect(isQuotaError(undefined)).toBe(false);
  });

  it('knows a failed download however each browser words it', () => {
    expect(isChunkLoadError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/a.js'))).toBe(true);
    expect(isChunkLoadError(new TypeError('Importing a module script failed.'))).toBe(true);
    expect(isChunkLoadError(new TypeError('error loading dynamically imported module'))).toBe(true);
    expect(isChunkLoadError(new Error('Template "x" is invalid'))).toBe(false);
  });

  it('knows running out of memory', () => {
    expect(isMemoryError(new RangeError('Array buffer allocation failed'))).toBe(true);
    expect(isMemoryError(new Error('Encoder failed', { cause: new Error('Out of memory') }))).toBe(true);
    expect(isMemoryError(new Error('Codec closed'))).toBe(false);
  });

  it('does not loop on a cause that points back at itself', () => {
    const looped = new Error('loop');
    (looped as { cause?: unknown }).cause = looped;
    expect(isQuotaError(looped)).toBe(false);
  });
});

describe('what saving says', () => {
  it('says the device is full only when it is, and what to do', () => {
    expect(saveFailureMessage(quota())).toMatch(/out of storage.*Delete projects you no longer need/);
    expect(mediaSaveFailureMessage(quota())).toMatch(/new photos are not saved/);
  });

  it('otherwise says the changes are still here, and how to keep them', () => {
    const said = saveFailureMessage(new Error('Transaction aborted'));
    expect(said).not.toMatch(/storage/);
    expect(said).toMatch(/still here.*project file/);
    expect(mediaSaveFailureMessage(new Error('x'))).toBe(said);
  });
});

describe('what a design or window that will not load says', () => {
  const missing = new TypeError('Failed to fetch dynamically imported module: /assets/marquee.js');

  it('offline: connect and try again', () => {
    online(false);
    expect(designFailureMessage(missing)).toBe('That design is not on this device yet. Connect to the internet, then reload the page.');
    expect(windowFailureMessage(missing)).toMatch(/not on this device yet/);
  });

  it('online: check the connection', () => {
    online(true);
    expect(designFailureMessage(missing)).toMatch(/could not be downloaded/);
  });

  it('a design that is broken rather than missing', () => {
    expect(designFailureMessage(new Error('Template "x" is invalid'))).toBe('That design could not be loaded. Try another, or reload the page.');
  });
});

describe('what a failed export says', () => {
  it('out of memory: what to lower', () => {
    expect(exportFailureMessage(new RangeError('Array buffer allocation failed'))).toMatch(/ran out of memory.*720p or 30 fps/);
  });

  it('a worker that died without a word', () => {
    expect(exportFailureMessage(new Error('Export worker failed: undefined'))).toMatch(/stopped unexpectedly.*Keep this tab open/);
    expect(exportFailureMessage(new Error(''))).toMatch(/stopped unexpectedly/);
  });

  it('the encoder that did not download', () => {
    online(false);
    expect(exportFailureMessage(new TypeError('Failed to fetch dynamically imported module'))).toMatch(/video maker is not on this device yet/);
  });

  it('anything else keeps its own words and adds what to try', () => {
    expect(exportFailureMessage(new Error('Could not render the audio mix')))
      .toBe('The export failed: Could not render the audio mix. Try again; if it fails again, try WebM or 720p.');
    expect(exportFailureMessage('The sound “Lo-fi Haze” is not ready.'))
      .toBe('The export failed: The sound “Lo-fi Haze” is not ready. Try again; if it fails again, try WebM or 720p.');
  });

  it('a sound that is not ready keeps its own words, which already say what to do (D-172)', () => {
    const notReady = new Error('A video in this design has not loaded yet, so its sound is not ready to export. Wait a moment and export again.');
    notReady.name = 'AudioNotReadyError';
    expect(exportFailureMessage(notReady)).toBe(notReady.message);
  });

  it('says plainly that WebM stands in for MP4 (§11.9)', () => {
    expect(MP4_FALLBACK).toBe('MP4 is not available in this browser — WebM will be used.');
  });
});
