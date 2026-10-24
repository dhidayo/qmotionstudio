import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { SOUND_LIBRARY, soundMediaId, type LibrarySound, type SoundKind } from '@/audio/library';
import { loadSound } from '@/media/sounds';
import { useEditor } from '@/state/store';
import { useMediaStore } from '@/ui/media/MediaProvider';
import { noHover } from '@/ui/library/PlayingPreview';
import { useHoldStill, usePreviewClock } from '@/ui/shell/ClockProvider';
import { useOverlays } from '@/ui/shell/overlays';
import { useMusicUpload } from '@/ui/timeline/useAddLayers';
import { addSound } from './addSound';
import { auditioning, audition, closeAudition, primeAudition, stopAudition, subscribeAudition } from './audition';
import { libraryBackgrounds } from './placeSound';

/**
 * + Sound: the sound library (D-156).
 *
 * "Generic sounds with effects that help the product ship videos with sounds
 * instead of only custom music." Two kinds, said plainly: background music,
 * which loops under the whole video, and effects, which go at the playhead.
 * Every sound can be listened to first — a background goes round its loop
 * exactly as it will under the video — and added with one press. The person's
 * own music is one press away at the foot of the list.
 *
 * A window on a computer, a sheet from the bottom on a phone, like the
 * effect library. Opened from the add bar's + Sound.
 */

type Tab = 'all' | SoundKind;

const TABS: readonly { readonly id: Tab; readonly label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'background', label: 'Background music' },
  { id: 'effect', label: 'Effects' },
];

const GROUPS: readonly { readonly kind: SoundKind; readonly title: string; readonly note: string }[] = [
  { kind: 'background', title: 'Background music', note: 'Loops under the whole video · one at a time' },
  { kind: 'effect', title: 'Effects', note: 'Added at the playhead' },
];

export function SoundPicker(): React.JSX.Element {
  const open = useOverlays((s) => s.soundPicker);
  /*
   * The device's file chooser lives here, outside the dialog, so it is still
   * on the page when the chosen file arrives — the dialog closes as the
   * chooser opens. Its own name, so it is never mistaken for + Music's.
   */
  const music = useMusicUpload('Choose a music file');
  const showToast = useEditor((s) => s.showToast);
  useEffect(() => { if (music.error !== null) showToast(music.error); }, [music.error, showToast]);
  return (
    <>
      {music.input}
      {open && <SoundDialog onUseFile={music.pick} />}
    </>
  );
}

function SoundDialog({ onUseFile }: { onUseFile: () => void }): React.JSX.Element {
  const close = (): void => { useOverlays.getState().openSoundPicker(false); };
  const media = useMediaStore();
  const showToast = useEditor((s) => s.showToast);
  const background = useEditor((s) => libraryBackgrounds(s.project.audio)[0]?.mediaId ?? null);
  const holdStill = useHoldStill();
  const clock = usePreviewClock();
  const [tab, setTab] = useState<Tab>('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState<string | null>(null);
  const playing = useSyncExternalStore(subscribeAudition, auditioning, () => null);
  /** The sound last asked for, so a slow fetch never starts one the person has moved on from. */
  const wanted = useRef<string | null>(null);
  const search = useRef<HTMLInputElement | null>(null);

  // Typing straight away with a keyboard; on a touch screen the search waits to be tapped (D-113).
  useEffect(() => { if (!noHover()) search.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') { event.preventDefault(); useOverlays.getState().openSoundPicker(false); }
    };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); };
  }, []);
  // The preview starting again stops a sound being listened to: one thing at a time.
  useEffect(() => clock?.subscribe(() => { if (clock.playing) stopAudition(); }), [clock]);
  // Closing stops it and lets its audio context go.
  useEffect(() => () => { wanted.current = null; closeAudition(); }, []);

  const listen = (sound: LibrarySound): void => {
    if (playing === sound.id || loading === sound.id) {
      wanted.current = null;
      setLoading(null);
      stopAudition();
      return;
    }
    // Inside the click, before anything waits: the only moment iOS lets sound start.
    primeAudition();
    holdStill();
    stopAudition();
    wanted.current = sound.id;
    const play = (): void => {
      const buffer = media.getAudioBuffer(soundMediaId(sound));
      if (!buffer || wanted.current !== sound.id) return;
      audition(sound.id, buffer, { ...(sound.loop ? { loop: sound.loop } : {}), gainDb: sound.defaultGainDb });
    };
    if (media.getAudioBuffer(soundMediaId(sound))) { setLoading(null); play(); return; }
    setLoading(sound.id);
    loadSound(media, sound)
      .then(() => {
        if (wanted.current !== sound.id) return;
        setLoading(null);
        play();
      })
      .catch((error: unknown) => {
        if (wanted.current === sound.id) { wanted.current = null; setLoading(null); }
        console.error(`Could not load the sound "${sound.id}".`, error);
        showToast(error instanceof Error ? error.message : 'That sound could not be loaded.');
      });
  };

  const add = (sound: LibrarySound): void => {
    wanted.current = null;
    stopAudition();
    try {
      showToast(addSound(sound));
    } catch (error: unknown) {
      // §16: never silently.
      console.error(`Could not add the sound "${sound.id}".`, error);
      showToast('That sound could not be added. Try another, or reload the page.');
    }
    close();
  };

  const words = query.trim().toLowerCase().split(/\s+/).filter((word) => word.length > 0);
  const matches = (sound: LibrarySound): boolean => {
    const text = [sound.name, sound.blurb, sound.category, ...sound.tags, sound.kind === 'background' ? 'background music loop' : 'effect sfx'].join(' ').toLowerCase();
    return words.every((word) => text.includes(word));
  };
  const groups = GROUPS
    .filter((group) => tab === 'all' || tab === group.kind)
    .map((group) => ({ ...group, sounds: SOUND_LIBRARY.filter((sound) => sound.kind === group.kind && matches(sound)) }))
    .filter((group) => group.sounds.length > 0);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Sounds"
      /* A sheet from the bottom on a phone (D-109), a window on a computer. */
      className="fixed inset-0 z-50 flex flex-col justify-end sm:items-center sm:justify-center sm:p-4"
      style={{ background: 'rgb(0 0 0 / 0.45)' }}
      onClick={(event) => { if (event.target === event.currentTarget) close(); }}
    >
      <div className="flex max-h-[90%] w-full flex-col rounded-t-2xl border border-edge bg-panel shadow-lg sm:w-[760px] sm:max-w-full sm:rounded-lg">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-edge px-4 py-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[14px] font-semibold">Add a sound</h2>
            <p className="text-[11px] text-ink-faint">Listen first, then add. Background music loops for the whole video; effects go at the playhead.</p>
          </div>
          <input
            ref={search}
            type="search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); }}
            placeholder="Search sounds"
            aria-label="Search sounds"
            className="order-last w-full rounded-md border border-edge bg-panel-alt px-2 py-1.5 text-[14px] focus:border-accent focus:outline-none sm:order-none sm:w-44 sm:py-1 sm:text-[12px]"
          />
          <button type="button" onClick={close} className="rounded-md border border-edge px-2.5 py-1 text-[12px] hover:bg-panel-alt">
            Close
          </button>
        </div>

        <div className="flex gap-1 overflow-x-auto border-b border-edge px-4 py-2" role="tablist" aria-label="Kinds of sound">
          {TABS.map(({ id, label }) => {
            const on = tab === id;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => { setTab(id); }}
                className="shrink-0 rounded-full border px-2.5 py-1 text-[12px] sm:py-0.5 sm:text-[11px]"
                style={{
                  borderColor: on ? 'var(--c-accent)' : 'var(--c-edge)',
                  background: on ? 'var(--c-accent-soft)' : 'transparent',
                  color: on ? 'var(--c-accent)' : 'var(--c-ink-muted)',
                  fontWeight: on ? 600 : 400,
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {groups.length === 0 && (
            <p className="py-8 text-center text-[12px] text-ink-faint">No sounds match “{query}”.</p>
          )}
          {groups.map((group) => (
            <section key={group.kind} className="mb-4 last:mb-1" aria-label={group.title}>
              <h3 className="mb-2 flex flex-wrap items-baseline gap-x-2 text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                {group.title}
                <span className="font-normal normal-case tracking-normal">{group.note}</span>
              </h3>
              <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {group.sounds.map((sound) => (
                  <SoundRow
                    key={sound.id}
                    sound={sound}
                    playing={playing === sound.id}
                    loading={loading === sound.id}
                    inUse={background === soundMediaId(sound)}
                    onListen={() => { listen(sound); }}
                    onAdd={() => { add(sound); }}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-edge px-4 py-2.5">
          <button
            type="button"
            onClick={() => { close(); onUseFile(); }}
            className="rounded-md border border-edge px-2.5 py-1.5 text-[12px] hover:bg-panel-alt sm:py-1"
          >
            Use a music file from your device…
          </button>
          <span className="text-[10px] text-ink-faint">MP3, M4A, WAV or OGG — your own music, under the video from its start.</span>
        </div>
      </div>
    </div>
  );
}

function SoundRow({
  sound,
  playing,
  loading,
  inUse,
  onListen,
  onAdd,
}: {
  sound: LibrarySound;
  playing: boolean;
  loading: boolean;
  inUse: boolean;
  onListen: () => void;
  onAdd: () => void;
}): React.JSX.Element {
  const active = playing || loading;
  const meta = sound.kind === 'background' && sound.loop
    ? `${sound.category} · ${sound.bpm ?? '–'} BPM · loops every ${((sound.loop.endMs - sound.loop.startMs) / 1000).toFixed(1)}s`
    : `${sound.category} · ${(sound.durationMs / 1000).toFixed(1)}s`;
  return (
    <li
      data-sound={sound.id}
      className="flex items-center gap-3 rounded-md border px-2.5 py-2 transition-colors"
      style={{ borderColor: active ? 'var(--c-accent)' : 'var(--c-edge)', background: active ? 'var(--c-accent-soft)' : 'transparent' }}
    >
      <button
        type="button"
        onClick={onListen}
        aria-pressed={active}
        aria-label={active ? `Stop ${sound.name}` : `Listen to ${sound.name}`}
        title={active ? 'Stop' : 'Listen'}
        className="grid size-9 shrink-0 place-items-center rounded-full border transition-colors"
        style={{
          borderColor: active ? 'var(--c-accent)' : 'var(--c-edge-strong)',
          background: active ? 'var(--c-accent)' : 'var(--c-panel-alt)',
          color: active ? 'var(--c-accent-ink)' : 'var(--c-ink)',
        }}
      >
        {loading ? <Spinner /> : playing ? <StopGlyph /> : <PlayGlyph />}
      </button>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[12px] font-semibold">{sound.name}</span>
          {inUse && (
            <span className="shrink-0 rounded-sm px-1 text-[9px] font-semibold uppercase tracking-wide" style={{ background: 'var(--c-accent-soft)', color: 'var(--c-accent)' }}>
              In use
            </span>
          )}
        </div>
        <p className="line-clamp-2 text-[11px] leading-snug text-ink-muted">{sound.blurb}</p>
        <p className="tabular mt-0.5 text-[10px] text-ink-faint">{meta}</p>
      </div>
      <button
        type="button"
        onClick={onAdd}
        aria-label={`Add ${sound.name}`}
        className="shrink-0 rounded-md border border-edge px-3 py-1.5 text-[12px] font-medium hover:border-accent hover:text-accent sm:py-1"
      >
        Add
      </button>
    </li>
  );
}

function PlayGlyph(): React.JSX.Element {
  return <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden><path d="M5 3.2v9.6L12.6 8z" fill="currentColor" /></svg>;
}

function StopGlyph(): React.JSX.Element {
  return <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden><rect x="3" y="3" width="10" height="10" rx="1.5" fill="currentColor" /></svg>;
}

function Spinner(): React.JSX.Element {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden className="animate-spin">
      <circle cx="8" cy="8" r="6" fill="none" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M8 2a6 6 0 0 1 6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
