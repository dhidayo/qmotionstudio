import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
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
import type { Project } from '@/document/types';
import type { MediaStore } from '@/media/store';
import type { PreviewClock } from '@/core/time/clock';
import { createRenderRig, disposeRenderRig } from '@/core/render/rig';
import { aspectValue, fitContain, renderSizeFor } from '@/core/math/aspect';
import { drawStill, renderStill } from '@/export/stills';
import {
  defaultImagePreset, IMAGE_PRESETS, imageFileName, imageSize,
  type ImageFormat, type ImagePreset,
} from '@/export/imagePresets';
import { pictureMomentMs, type PictureMoment } from '@/export/picture';
import { chosenMomentMs, restMomentMs } from '@/templates/restMoment';
import { playedAudio } from '@/document/select/videoSound';
import { usePreviewClock } from '@/ui/shell/ClockProvider';
import { isAppleTouch } from '@/ui/shell/platform';
import { Button, Row, Section, Segmented } from '@/ui/inspector/controls';

type Phase =
  | { kind: 'idle' }
  | { kind: 'running'; progress: ExportProgress }
  | { kind: 'done'; fileName: string; bytes: number; seconds: number; file: File; toPhotos: boolean; live: boolean }
  | { kind: 'error'; message: string };

/**
 * §11.8: real progress, a working cancel, and a clear error surface.
 *
 * What can be saved follows the mode (D-155): "allow the Design to be
 * exportable as high definition images … user can be allowed to export as
 * videos as well … On Video, only video can be exported." An image opens on
 * Image, with Video beside it; a video has nothing to choose, which retires
 * D-135's carousel of a video's scenes.
 */
export function ExportDialog({ onClose }: { onClose: () => void }): React.JSX.Element {
  const project = useEditor((s) => s.project);
  const media = useMediaStore();
  const { limits } = useEntitlements(project.mode);
  const imageMode = project.mode === 'showcase';

  const [settings, setSettings] = useState<ExportSettings>(DEFAULT_EXPORT);
  const [what, setWhat] = useState<'image' | 'video'>(imageMode ? 'image' : 'video');
  const making = imageMode ? what : 'video';
  // Chosen here so the header can say the size; offered first is the first the plan can save.
  const [presetId, setPresetId] = useState(() => defaultImagePreset(project.aspect, limits.maxImageShortEdge).id);
  const preset = IMAGE_PRESETS[project.aspect].find((p) => p.id === presetId) ?? defaultImagePreset(project.aspect, limits.maxImageShortEdge);
  const picture = imageSize(project.aspect, preset);
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
        className="max-h-[calc(100dvh-24px)] w-[360px] max-w-[calc(100vw-24px)] overflow-y-auto overscroll-contain rounded-lg border border-edge bg-panel p-4"
        style={{ boxShadow: 'var(--shadow-lg)' }}
      >
        <div className="mb-3 flex items-baseline justify-between">
          <h2 className="text-[14px] font-semibold">Export</h2>
          <span className="tabular text-[11px] text-ink-faint">
            {making === 'video' ? `${size.w}×${size.h} · ${totalFrames} frames` : `${picture.w}×${picture.h} · one picture`}
          </span>
        </div>

        {imageMode && !running && (
          <Segmented<'image' | 'video'>
            label="Save as"
            value={what}
            options={[
              { value: 'image', label: 'Image' },
              { value: 'video', label: 'Video' },
            ]}
            onChange={setWhat}
          />
        )}

        {making === 'image' ? (
          <ImageExport preset={preset} onPreset={setPresetId} onClose={onClose} />
        ) : (<>

        {!offline && (
          <p className="mb-3 rounded-md border border-edge p-2 text-[11px] leading-relaxed text-ink-muted" data-export-fallback>
            This browser has no WebCodecs support, so export falls back to
            real-time recording — WebM only. It takes as long as the clip and
            the result may drop frames.
            {/* The recording films the canvas alone: say so before the music is missed (D-155). */}
            {playedAudio(project, media.videoSoundOf).length > 0 && <> It is also <strong style={{ color: 'var(--c-ink)' }} data-export-silent>without sound</strong>: your music and your videos’ sound will not be in the file.</>}
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

/**
 * The picture moment as React state (D-155): the frame Export → Image saves,
 * re-read whenever the transport changes — a pause, a seek, the play ending.
 * Between those it cannot change: while playing it is the picture moment.
 */
function usePictureMoment(clock: PreviewClock | null, project: Project): PictureMoment {
  const videoMs = totalDurationMs(project);
  const restMs = restMomentMs(project);
  const chosen = chosenMomentMs(project) !== null;
  const subscribe = useCallback(
    (onChange: () => void) => (clock === null ? () => undefined : clock.subscribe(onChange)),
    [clock],
  );
  // A string, so an unchanged moment is the same snapshot.
  const key = useSyncExternalStore(subscribe, () => {
    const moment = pictureMomentMs({
      videoMs,
      restMs,
      clockMs: clock?.timeMs ?? 0,
      playing: clock?.playing ?? false,
      ended: clock?.ended ?? false,
      chosen,
    });
    return `${moment.atMs}|${moment.source}`;
  });
  const [at, source] = key.split('|');
  return { atMs: Number(at), source: source === 'paused' || source === 'chosen' ? source : 'rest' };
}

/** In whole hundredths, as the slider's readout says it: the last frame of 10s is 9.99s, not 10.00s. */
const seconds = (ms: number): string => `${(Math.floor(ms / 10) / 100).toFixed(2)}s`;

/**
 * An image as a picture (D-155): "high definition images, which can serve as
 * … picture posting, thumbnail pictures for youtube videos or blogposts".
 *
 * The sizes are offered as what they are for, in the image's own frame shape
 * (`IMAGE_PRESETS`), as PNG or JPG; a YouTube thumbnail is a JPG kept under
 * YouTube's 2 MB. The picture is the frame on screen — the picture moment,
 * or the frame paused on — shown small above the choices, with the moment
 * named. Free saves up to full HD with the watermark; Pro up to 4K.
 */
function ImageExport({
  preset,
  onPreset,
  onClose,
}: {
  preset: ImagePreset;
  onPreset: (id: string) => void;
  onClose: () => void;
}): React.JSX.Element {
  const project = useEditor((s) => s.project);
  const media = useMediaStore();
  const clock = usePreviewClock();
  const { limits } = useEntitlements(project.mode);
  const [chosenFormat, setFormat] = useState<ImageFormat>('png');
  // A destination that takes only one format decides it.
  const format = preset.format ?? chosenFormat;
  const size = imageSize(project.aspect, preset);
  const locked = preset.shortEdge > limits.maxImageShortEdge;
  const moment = usePictureMoment(clock, project);
  const restMs = restMomentMs(project);
  const [state, setState] = useState<
    | { kind: 'idle' }
    | { kind: 'running' }
    | { kind: 'done'; file: File; share: boolean; fits: boolean }
    | { kind: 'error'; message: string }
  >({ kind: 'idle' });
  const [shareError, setShareError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const run = (): void => {
    setSent(false);
    setShareError(null);
    setState({ kind: 'running' });
    void renderStill({
      project,
      media,
      size,
      atMs: moment.atMs,
      watermark: limits.watermark,
      format,
      maxBytes: preset.maxBytes,
    })
      .then(({ blob, fits }) => {
        const file = new File([blob], imageFileName(project.name, size, format), { type: blob.type || (format === 'png' ? 'image/png' : 'image/jpeg') });
        // On a phone the picture goes to Photos through the share sheet (D-125).
        const share = savesToPhotos(file);
        if (!share) downloadBlob(file, file.name);
        setState({ kind: 'done', file, share, fits });
      })
      .catch((error: unknown) => {
        // §16: an export error is said, never swallowed.
        console.error('Image export failed.', error);
        setState({ kind: 'error', message: error instanceof Error ? error.message : String(error) });
      });
  };

  const share = (file: File): void => {
    setShareError(null);
    navigator.share({ files: [file], title: project.name })
      .then(() => { setSent(true); })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return;
        console.error('Sharing the image failed.', reason);
        setShareError(reason instanceof Error ? reason.message : String(reason));
      });
  };

  const mb = (bytes: number): string => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

  return (
    <div data-export-image>
      <div className="mb-3 flex items-center gap-3">
        <StillPreview project={project} media={media} atMs={moment.atMs} watermark={limits.watermark} />
        <div className="min-w-0 flex-1 text-[11px] leading-relaxed text-ink-muted" data-picture-moment={moment.source}>
          {moment.source === 'chosen' ? (
            <>
              <p className="font-semibold text-ink">Your chosen frame · {seconds(moment.atMs)}</p>
              <p>Where the design comes to rest, chosen with “Use this frame”. Pause on another frame to save that one instead.</p>
            </>
          ) : moment.source === 'rest' ? (
            <>
              <p className="font-semibold text-ink">Picture moment · {seconds(moment.atMs)}</p>
              <p>Where the design comes to rest. Pause on another frame to save that one, or choose it with “Use this frame”.</p>
            </>
          ) : (
            <>
              <p className="font-semibold text-ink">The frame you paused on · {seconds(moment.atMs)}</p>
              {restMs !== null && clock !== null && (
                <button
                  type="button"
                  onClick={() => { clock.pause(); clock.seek(restMs); }}
                  className="mt-1 rounded-md border border-edge px-2 py-0.5 text-[11px] hover:bg-panel-alt"
                >
                  {chosenMomentMs(project) === null ? 'Use the picture moment' : 'Use your chosen frame'}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      <Section>
        <Row label="Size">
          {/* One column that may shrink, so a long use is cut short rather than widening the dialog. */}
          <div role="radiogroup" aria-label="Size" className="grid grid-cols-1 gap-1">
            {IMAGE_PRESETS[project.aspect].map((option) => {
              const optionSize = imageSize(project.aspect, option);
              const active = option.id === preset.id;
              const pro = option.shortEdge > limits.maxImageShortEdge;
              const dims = `${optionSize.w} × ${optionSize.h}`;
              return (
                <button
                  key={option.id}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={`${dims}, ${option.use}${pro ? ', Pro' : ''}`}
                  onClick={() => { onPreset(option.id); }}
                  className="flex items-center gap-2 rounded-md border px-2 py-1.5 text-left transition-colors"
                  style={{
                    borderColor: active ? 'var(--c-accent)' : 'var(--c-edge)',
                    background: active ? 'var(--c-accent-soft)' : 'transparent',
                    transitionDuration: 'var(--t-fast)',
                  }}
                >
                  <span className="tabular w-[84px] shrink-0 text-[12px] font-semibold" style={{ color: active ? 'var(--c-accent)' : 'var(--c-ink)' }}>{dims}</span>
                  <span className="min-w-0 flex-1 truncate text-[11px] text-ink-muted">{option.use}</span>
                  {pro && (
                    <span className="shrink-0 rounded-sm px-1 py-0.5 text-[9px] font-bold uppercase" style={{ background: 'var(--c-pro-soft)', color: 'var(--c-pro)' }}>
                      Pro
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </Row>
        {preset.format === undefined ? (
          <Segmented<ImageFormat>
            label="Format"
            value={format}
            options={[
              { value: 'png', label: 'PNG · sharpest' },
              { value: 'jpeg', label: 'JPG · smaller file' },
            ]}
            onChange={setFormat}
          />
        ) : (
          <Row label="Format">
            <p className="text-[11px] text-ink-muted" data-format-note>{preset.why ?? (format === 'png' ? 'PNG' : 'JPG')}</p>
          </Row>
        )}
      </Section>

      {locked && (
        <p className="mb-3 rounded-md border p-2 text-[11px] leading-relaxed" style={{ borderColor: 'var(--c-pro)', color: 'var(--c-ink-muted)' }} data-image-pro>
          <strong style={{ color: 'var(--c-pro)' }}>Pro</strong> saves pictures up to 4K. Free pictures go up to {limits.maxImageShortEdge} pixels on the short side.
        </p>
      )}
      {limits.watermark && !locked && <p className="mb-3 text-[11px] text-ink-faint">Free pictures carry the small watermark.</p>}

      {state.kind === 'running' && <p className="mb-3 text-[12px] text-ink-muted" role="status">Drawing the picture…</p>}
      {state.kind === 'error' && <p className="mb-3 text-[11px]" style={{ color: 'var(--c-danger)' }}>{state.message}</p>}
      {state.kind === 'done' && !state.share && (
        <p className="mb-3 text-[11px] leading-relaxed text-ink-muted" data-image-done>
          Saved <strong style={{ color: 'var(--c-ink)' }}>{state.file.name}</strong> — {mb(state.file.size)}.
          {!state.fits && ' That is larger than this size allows; a design with fewer photos makes a smaller file.'}
        </p>
      )}
      {state.kind === 'done' && state.share && (
        <div className="mb-3" data-save-to-photos>
          <p className="mb-2 text-[12px] text-ink-muted">
            {isAppleTouch() ? <>Tap <strong style={{ color: 'var(--c-ink)' }}>Save to Photos</strong>, then <strong style={{ color: 'var(--c-ink)' }}>Save Image</strong>.</> : 'Save it to your gallery or send it straight to an app.'}
          </p>
          {sent ? (
            <p className="flex items-center gap-2 rounded-xl border px-3 py-3 text-[14px] font-semibold" style={{ borderColor: 'var(--c-accent)', color: 'var(--c-accent)' }} role="status" data-saved>
              <span aria-hidden>✓</span> {isAppleTouch() ? 'Saved — your picture is in Photos.' : 'Done — sent where you chose.'}
            </p>
          ) : (
            <button type="button" onClick={() => { share(state.file); }} className="w-full rounded-xl bg-accent py-3 text-[15px] font-semibold text-accent-ink">
              {isAppleTouch() ? 'Save to Photos' : 'Save or share'}
            </button>
          )}
          <button
            type="button"
            onClick={() => { downloadBlob(state.file, state.file.name); }}
            className="mt-1.5 w-full rounded-xl border border-edge py-2 text-[13px]"
          >
            Save to Files instead
          </button>
          {shareError !== null && <p className="mt-2 text-[11px]" style={{ color: 'var(--c-danger)' }}>Could not open sharing: {shareError}</p>}
        </div>
      )}

      <div className="flex gap-1">
        <Button onClick={onClose}>Close</Button>
        <Button variant="accent" onClick={run} disabled={state.kind === 'running' || locked}>
          {state.kind === 'done' ? 'Export again' : 'Export image'}
        </Button>
      </div>
    </div>
  );
}

/** The largest the preview is drawn, in CSS pixels: a glance, not a second artboard. */
const PREVIEW_BOX = { w: 132, h: 132 };

/**
 * The picture, small, as it will be saved (D-155) — drawn by the exporter's
 * own renderer on a rig of its own, never the artboard's (D-001), and
 * redrawn a moment after the frame or the document changes.
 */
function StillPreview({
  project,
  media,
  atMs,
  watermark,
}: {
  project: Project;
  media: MediaStore;
  atMs: number;
  watermark: boolean;
}): React.JSX.Element {
  const canvas = useRef<HTMLCanvasElement>(null);
  const box = fitContain(PREVIEW_BOX, aspectValue(project.aspect));
  const dpr = typeof devicePixelRatio === 'number' ? Math.min(devicePixelRatio, 2) : 1;
  const backing = renderSizeFor(project.aspect, Math.round(Math.min(box.w, box.h) * dpr));
  // Built again on a change of plan, so the watermark comes and goes with it (§12).
  const rig = useMemo(() => createRenderRig(media, () => watermark), [media, watermark]);
  useEffect(() => () => { disposeRenderRig(rig); }, [rig]);

  useEffect(() => {
    const el = canvas.current;
    const ctx = el?.getContext('2d', { alpha: false });
    if (!ctx) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      drawStill(ctx, project, media, atMs, rig).catch((error: unknown) => {
        if (!cancelled) console.error('Could not draw the picture preview.', error);
      });
    }, 120);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [project, media, atMs, rig, backing.w, backing.h]);

  return (
    // As wide as the box whatever the shape, so the words beside it line up; as tall as the picture.
    <span className="grid shrink-0 items-center justify-items-start" style={{ width: PREVIEW_BOX.w, height: box.h }}>
      <canvas
        ref={canvas}
        width={backing.w}
        height={backing.h}
        aria-label="The picture, as it will be saved"
        data-still-preview
        className="block rounded-md border border-edge"
        style={{ width: box.w, height: box.h, background: 'var(--c-panel-alt)' }}
      />
    </span>
  );
}

/** The finished video, offered to Photos first and to Files second. */
function SaveToPhotos({ file, bytes }: { file: File; bytes: number }): React.JSX.Element {
  const [error, setError] = useState<string | null>(null);
  // Said once the sheet reports it went through (D-139): "no notifications if
  // it has been saved or not… would have helped the users from clicking multiple times".
  const [sent, setSent] = useState(false);
  // An iPad asks for the desktop site, so it says "Macintosh" — with a touch screen.
  const apple = isAppleTouch();

  const share = (): void => {
    setError(null);
    // Needs the tap that called it: the share sheet only opens from a gesture.
    navigator.share({ files: [file], title: file.name })
      .then(() => { setSent(true); })
      .catch((reason: unknown) => {
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
      {sent ? (
        <p className="flex items-center gap-2 rounded-xl border px-3 py-3 text-[14px] font-semibold" style={{ borderColor: 'var(--c-accent)', color: 'var(--c-accent)' }} role="status" data-saved>
          <span aria-hidden>✓</span> {apple ? 'Saved — your video is in Photos.' : 'Done — your video went where you sent it.'}
        </p>
      ) : (
        <button
          type="button"
          onClick={share}
          className="w-full rounded-xl bg-accent py-3 text-[15px] font-semibold text-accent-ink"
        >
          {apple ? 'Save to Photos' : 'Save or share'}
        </button>
      )}
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
