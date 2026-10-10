import { useCallback, useEffect, useRef, useState } from 'react';
import { useEditor } from '@/state/store';
import { useMediaStore } from '@/ui/media/MediaProvider';
import { useEntitlements } from '@/entitlements';
import {
  canUseOfflineExport, downloadBlob, ExportCancelled, probeFormats, startExport,
  type ExportHandle, type ExportProgress,
} from '@/export';
import {
  DEFAULT_EXPORT, exportSize, frameCount,
  type ExportFormat, type ExportSettings, type FormatAvailability, type QualityTier,
} from '@/export/config';
import { totalDurationMs } from '@/document/select/timeline';
import { renderStills } from '@/export/stills';
import { makeZip } from '@/export/zip';
import { makePdf } from '@/export/pdf';
import { Button, Section, Segmented } from '@/ui/inspector/controls';

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; progress: ExportProgress }
  | { kind: 'done'; fileName: string; bytes: number; seconds: number; file: File; toPhotos: boolean; live: boolean }
  | { kind: 'error'; message: string };

/** §11.8: real progress, a working cancel, and a clear error surface. */
export function ExportDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const project = useEditor((s) => s.project);
  const media = useMediaStore();
  const { limits } = useEntitlements(project.mode);

  const [settings, setSettings] = useState<ExportSettings>(DEFAULT_EXPORT);
  // A video, or its scenes as pictures — a carousel (D-135).
  const [what, setWhat] = useState<'video' | 'images'>('video');
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [formats, setFormats] = useState<FormatAvailability[] | null>(null);
  const handle = useRef<ExportHandle | null>(null);

  const size = exportSize(project.aspect, settings);
  const durationMs = totalDurationMs(project);
  const totalFrames = frameCount(durationMs, settings.fps);
  const offline = canUseOfflineExport();

  const probeW = size.w;
  const probeH = size.h;
  useEffect(() => {
    let cancelled = false;
    // §11.1: probed per resolution, since support is not uniform across sizes.
    void probeFormats({ w: probeW, h: probeH }).then((probed) => {
      if (!cancelled) setFormats(probed);
    });
    return () => { cancelled = true; };
  }, [probeW, probeH]);

  const run = useCallback(() => {
    setPhase({ kind: 'running', progress: { stage: 'preparing', frame: 0, totalFrames, path: 'offline' } });

    const started = startExport({
      project,
      settings,
      media,
      watermark: limits.watermark,
      onProgress: (progress) => { setPhase({ kind: 'running', progress }); },
    });
    handle.current = started;

    started.result
      .then((result) => {
        const file = new File([result.blob], result.fileName, { type: result.blob.type || 'video/mp4' });
        // On a phone the video goes to Photos through the share sheet (D-125);
        // a download there lands in Files, where nobody looks for a video.
        const toPhotos = savesToPhotos(file);
        if (!toPhotos) downloadBlob(result.blob, result.fileName);
        setPhase({
          kind: 'done',
          fileName: result.fileName,
          bytes: result.blob.size,
          seconds: result.durationMs / 1000,
          file,
          toPhotos,
          live: result.path === 'realtime',
        });
      })
      .catch((error: unknown) => {
        if (error instanceof ExportCancelled) {
          setPhase({ kind: 'idle' });
          return;
        }
        // §16: never swallow an export error.
        console.error('Export failed.', error);
        setPhase({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      })
      .finally(() => { handle.current = null; });
  }, [project, settings, media, totalFrames, limits.watermark]);

  useEffect(() => () => { handle.current?.cancel(); }, []);

  const availability = formats?.find((f) => f.format === settings.format);
  /*
   * The codec probe only gates the *offline* path. Without WebCodecs the probe
   * reports every format unavailable — correctly — and gating on it there
   * would disable the Export button and make the fallback unreachable, which
   * is precisely what happened before the fallback had a test.
   */
  const blocked = offline && availability?.available === false;
  const running = phase.kind === 'running';
  // The fallback is WebM only (§11.9), so the format choice is moot there.
  const formatLocked = !offline;

  return (
    <div
      className="fixed inset-0 z-40 grid place-items-center"
      style={{ background: 'color-mix(in srgb, var(--c-bg) 70%, transparent)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Export"
    >
      <div
        className="w-[360px] max-w-[calc(100vw-24px)] rounded-lg border border-edge bg-panel p-4"
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[14px] font-semibold">Export</h2>
          <span className="tabular text-[11px] text-ink-faint">
            {what === 'video' ? `${size.w}×${size.h} · ${totalFrames} frames` : `${size.w}×${size.h} · ${project.scenes.length} ${project.scenes.length === 1 ? 'picture' : 'pictures'}`}
          </span>
        </div>

        {!running && (
          <Segmented<'video' | 'images'>
            label="Make"
            value={what}
            options={[
              { value: 'video', label: 'Video' },
              { value: 'images', label: project.scenes.length > 1 ? 'Images · carousel' : 'Image' },
            ]}
            onChange={setWhat}
          />
        )}

        {what === 'images' ? (
          <ImagesExport shortEdge={settings.shortEdge} onShortEdge={(shortEdge) => { setSettings((s) => ({ ...s, shortEdge })); }} onClose={onClose} />
        ) : (<>

        {!offline && (
          <p className="mb-3 rounded-md border border-edge p-2 text-[11px] leading-relaxed text-ink-muted">
            This browser has no WebCodecs support, so export falls back to
            real-time recording — WebM only. It takes as long as the clip and
            the result may drop frames.
          </p>
        )}

        <Section>
          {!formatLocked && (
            <Segmented<ExportFormat>
              label="Format"
              value={settings.format}
              options={[
                { value: 'mp4', label: 'MP4 · H.264' },
                { value: 'webm', label: 'WebM · VP9' },
              ]}
              onChange={(format) => { setSettings((s) => ({ ...s, format })); }}
            />
          )}
          <Segmented<720 | 1080>
            label="Resolution"
            value={settings.shortEdge}
            options={[
              { value: 720, label: '720p' },
              { value: 1080, label: '1080p' },
            ]}
            onChange={(shortEdge) => { setSettings((s) => ({ ...s, shortEdge })); }}
          />
          <Segmented<30 | 60>
            label="Frame rate"
            value={settings.fps}
            options={[
              { value: 30, label: '30 fps' },
              { value: 60, label: '60 fps' },
            ]}
            onChange={(fps) => { setSettings((s) => ({ ...s, fps })); }}
          />
          <Segmented<QualityTier>
            label="Quality"
            value={settings.quality}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
            ]}
            onChange={(quality) => { setSettings((s) => ({ ...s, quality })); }}
          />
        </Section>

        {blocked && availability.reason !== undefined && (
          <p className="mb-3 text-[11px] leading-relaxed" style={{ color: 'var(--c-danger)' }}>
            {availability.reason}
          </p>
        )}

        {limits.watermark && (
          <p className="mb-3 text-[11px] text-ink-faint">
            Free exports carry a small watermark.
          </p>
        )}

        {phase.kind === 'running' && <Progress progress={phase.progress} />}

        {phase.kind === 'done' && !phase.toPhotos && (
          <p className="mb-3 text-[11px] leading-relaxed text-ink-muted">
            Saved <strong style={{ color: 'var(--c-ink)' }}>{phase.fileName}</strong> —{' '}
            {(phase.bytes / 1024 / 1024).toFixed(1)}MB in {phase.seconds.toFixed(1)}s.
          </p>
        )}

        {phase.kind === 'done' && phase.toPhotos && (
          <SaveToPhotos file={phase.file} bytes={phase.bytes} />
        )}

        {/* Said, because it explains a jerky file: this browser could only film the preview as it played (D-127). */}
        {phase.kind === 'done' && phase.live && (
          <p className="mb-3 rounded-md border border-edge p-2 text-[11px] leading-relaxed text-ink-muted" data-export-live>
            This browser could not render the video frame by frame, so it was recorded as it played — any stutter in the
            preview is in the file. Chrome, Edge or an up-to-date Safari export frame by frame.
          </p>
        )}

        {phase.kind === 'error' && (
          <p className="mb-3 text-[11px] leading-relaxed" style={{ color: 'var(--c-danger)' }}>
            {phase.message}
          </p>
        )}

        <div className="flex gap-1">
          {running ? (
            <Button variant="danger" onClick={() => { handle.current?.cancel(); }}>
              Cancel
            </Button>
          ) : (
            <>
              <Button onClick={onClose}>Close</Button>
              <Button variant="accent" onClick={run} disabled={blocked || formats === null}>
                {phase.kind === 'done' ? 'Export again' : 'Export'}
              </Button>
            </>
          )}
        </div>
        </>)}
      </div>
    </div>
  );
}

/**
 * Whether this device saves a video by sharing it (D-125).
 *
 * A web page cannot write into the Photos app. On an iPhone or iPad the way
 * there is the share sheet, whose "Save Video" puts the clip in Photos; a
 * download goes to Files instead, which is not where anyone looks for a video
 * they just made. Android phones share too, and their Gallery shows
 * downloads, so they get both. A computer just downloads.
 */
function savesToPhotos(file: File | readonly File[]): boolean {
  if (typeof navigator.canShare !== 'function') return false;
  const touch = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches;
  if (!touch) return false;
  try {
    const files: File[] = file instanceof File ? [file] : [...file];
    return navigator.canShare({ files });
  } catch {
    return false;
  }
}

const isApple = (): boolean =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) || (/macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 1);

/**
 * The scenes as pictures (D-135): PNGs — one ZIP on a computer, straight to
 * Photos on a phone — or a PDF, which LinkedIn shows as a swipeable document.
 */
function ImagesExport({
  shortEdge,
  onShortEdge,
  onClose,
}: {
  shortEdge: 720 | 1080;
  onShortEdge: (shortEdge: 720 | 1080) => void;
  onClose: () => void;
}): React.JSX.Element {
  const project = useEditor((s) => s.project);
  const media = useMediaStore();
  const { limits } = useEntitlements(project.mode);
  const [format, setFormat] = useState<'png' | 'pdf'>('png');
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'running'; done: number; total: number }
    | { kind: 'done'; files: readonly File[]; share: boolean; note: string }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const [shareError, setShareError] = useState<string | null>(null);
  const size = exportSize(project.aspect, { ...DEFAULT_EXPORT, shortEdge });
  const count = project.scenes.length;
  const stem = (project.name.trim().replace(/[^\w\s-]/g, '').replace(/\s+/g, '-').toLowerCase() || 'motion-studio') + `-${shortEdge}p`;

  const run = (): void => {
    setState({ kind: 'running', done: 0, total: count });
    void renderStills({
      project,
      media,
      size,
      watermark: limits.watermark,
      type: format === 'pdf' ? 'image/jpeg' : 'image/png',
      stem,
      onProgress: (done, total) => { setState({ kind: 'running', done, total }); },
    })
      .then(async (stills) => {
        if (format === 'pdf') {
          const pages = await Promise.all(stills.map(async (still) => ({ jpeg: new Uint8Array(await still.blob.arrayBuffer()), width: still.width, height: still.height })));
          const file = new File([makePdf(pages)], `${stem}.pdf`, { type: 'application/pdf' });
          const share = savesToPhotos(file);
          if (!share) downloadBlob(file, file.name);
          setState({ kind: 'done', files: [file], share, note: `${file.name} — ${stills.length} ${stills.length === 1 ? 'page' : 'pages'}.` });
          return;
        }
        const files = stills.map((still) => new File([still.blob], still.name, { type: 'image/png' }));
        const share = savesToPhotos(files);
        if (!share) {
          if (files.length === 1 && files[0]) downloadBlob(files[0], files[0].name);
          else {
            const zip = makeZip(await Promise.all(files.map(async (file) => ({ name: file.name, data: new Uint8Array(await file.arrayBuffer()) }))));
            downloadBlob(zip, `${stem}-slides.zip`);
          }
        }
        setState({ kind: 'done', files, share, note: files.length === 1 ? `Saved ${files[0]?.name ?? 'the picture'}.` : `Saved ${files.length} slides, in order, as ${stem}-slides.zip.` });
      })
      .catch((error: unknown) => {
        // §16: an export error is said, never swallowed.
        console.error('Image export failed.', error);
        setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      });
  };

  const share = (files: readonly File[]): void => {
    setShareError(null);
    navigator.share({ files: [...files], title: project.name }).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      console.error('Sharing the images failed.', reason);
      setShareError(reason instanceof Error ? reason.message : String(reason));
    });
  };

  return (
    <div data-export-images>
      <p className="mb-3 text-[11px] leading-relaxed text-ink-muted">
        {count > 1
          ? 'One picture per scene, taken once each has settled — ready for an Instagram carousel or a LinkedIn document.'
          : 'A still of this design, once it has settled.'}
      </p>
      <Section>
        <Segmented<'png' | 'pdf'>
          label="As"
          value={format}
          options={[
            { value: 'png', label: count > 1 ? 'Pictures · PNG' : 'Picture · PNG' },
            { value: 'pdf', label: 'PDF · LinkedIn' },
          ]}
          onChange={setFormat}
        />
        <Segmented<720 | 1080>
          label="Size"
          value={shortEdge}
          options={[{ value: 720, label: '720p' }, { value: 1080, label: '1080p' }]}
          onChange={onShortEdge}
        />
      </Section>
      {limits.watermark && <p className="mb-3 text-[11px] text-ink-faint">Free pictures carry the small watermark.</p>}

      {state.kind === 'running' && (
        <p className="mb-3 text-[12px] text-ink-muted" role="status">Drawing picture {state.done + (state.done < state.total ? 1 : 0)} of {state.total}…</p>
      )}
      {state.kind === 'error' && <p className="mb-3 text-[11px]" style={{ color: 'var(--c-danger)' }}>{state.message}</p>}
      {state.kind === 'done' && !state.share && <p className="mb-3 text-[11px] text-ink-muted" data-images-done>{state.note}</p>}
      {state.kind === 'done' && state.share && (
        <div className="mb-3" data-save-to-photos>
          <p className="mb-2 text-[12px] text-ink-muted">
            {format === 'pdf' ? 'Your PDF is ready. Send it to LinkedIn or save it to Files.' : isApple() ? <>Tap <strong style={{ color: 'var(--c-ink)' }}>Save to Photos</strong>, then <strong style={{ color: 'var(--c-ink)' }}>Save {state.files.length === 1 ? 'Image' : `${state.files.length} Images`}</strong>.</> : 'Save them to your gallery or send them straight to an app.'}
          </p>
          <button type="button" onClick={() => { share(state.files); }} className="w-full rounded-xl bg-accent py-3 text-[15px] font-semibold text-accent-ink">
            {format === 'pdf' ? 'Share the PDF' : isApple() ? 'Save to Photos' : 'Save or share'}
          </button>
          {shareError !== null && <p className="mt-2 text-[11px]" style={{ color: 'var(--c-danger)' }}>Could not open sharing: {shareError}</p>}
        </div>
      )}

      <div className="flex gap-1">
        <Button onClick={onClose}>Close</Button>
        <Button variant="accent" onClick={run} disabled={state.kind === 'running'}>
          {state.kind === 'done' ? 'Export again' : count > 1 ? `Export ${count} pictures` : 'Export picture'}
        </Button>
      </div>
    </div>
  );
}

/** The finished video, offered to Photos first and to Files second. */
function SaveToPhotos({ file, bytes }: { file: File; bytes: number }): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  // An iPad asks for the desktop site, so it says "Macintosh" — with a touch screen.
  const apple = isApple();

  const share = (): void => {
    setError(null);
    // Needs the tap that called it: the share sheet only opens from a gesture.
    navigator.share({ files: [file], title: file.name }).catch((reason: unknown) => {
      // Closing the sheet is a choice, not a failure.
      if (reason instanceof DOMException && reason.name === 'AbortError') return;
      console.error('Sharing the export failed.', reason);
      setError(reason instanceof Error ? reason.message : String(reason));
    });
  };

  return (
    <div className="mb-3" data-save-to-photos>
      <p className="mb-2 text-[12px] leading-relaxed text-ink-muted">
        Your video is ready — {(bytes / 1024 / 1024).toFixed(1)}MB.{' '}
        {apple ? <>Tap <strong style={{ color: 'var(--c-ink)' }}>Save to Photos</strong>, then <strong style={{ color: 'var(--c-ink)' }}>Save Video</strong>.</> : 'Save it to your gallery or send it straight to an app.'}
      </p>
      <button
        type="button"
        onClick={share}
        className="w-full rounded-xl bg-accent py-3 text-[15px] font-semibold text-accent-ink"
      >
        {apple ? 'Save to Photos' : 'Save or share'}
      </button>
      <button
        type="button"
        onClick={() => { downloadBlob(file, file.name); }}
        className="mt-1.5 w-full rounded-xl border border-edge py-2 text-[13px]"
      >
        Save to Files instead
      </button>
      {error !== null && (
        <p className="mt-2 text-[11px]" style={{ color: 'var(--c-danger)' }}>Could not open sharing: {error}</p>
      )}
    </div>
  );
}

function Progress({ progress }: { progress: ExportProgress }): React.JSX.Element {
  const pct = progress.totalFrames > 0 ? (progress.frame / progress.totalFrames) * 100 : 0;
  const label =
    progress.stage === 'preparing'
      ? 'Preparing…'
      : progress.stage === 'finalising'
        ? 'Finalising…'
        : `Encoding frame ${progress.frame} of ${progress.totalFrames}`;

  return (
    <div className="mb-3">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] text-ink-muted">{label}</span>
        <span className="tabular text-[11px] text-ink-faint">{pct.toFixed(0)}%</span>
      </div>
      <div className="h-1 w-full overflow-hidden rounded-full" style={{ background: 'var(--c-edge)' }}>
        <div
          className="h-full rounded-full transition-[width]"
          style={{ width: `${pct}%`, background: 'var(--c-accent)', transitionDuration: '120ms' }}
        />
      </div>
    </div>
  );
}
