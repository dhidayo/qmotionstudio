import { useEffect } from 'react';
import * as actions from '@/document/actions';
import { DEFAULT_BACKGROUND_DIM } from '@/templates/_shared/chrome';
import { LOOK_PRESETS, type LookPreset } from '@/templates/_shared/look';
import type { LookSettings } from '@/document/types';
import { useMediaRevision, useMediaStore } from '@/ui/media/MediaProvider';
import { useOverlays } from '@/ui/shell/overlays';
import { PALETTE_ROLES, type PaletteRole } from '@/core/types';
import type { BackgroundTreatment } from '@/document/types';
import { useEditor } from '@/state/store';
import type { SceneTemplate } from '@/templates/schema';
import { Button, ColorField, EmptyNote, Section, Segmented, Slider } from '../controls';
import { saveBrandKit, useBrandKit } from '@/ui/brand/brandKit';
import { restoreMedia } from '@/persist/media';
import { SceneLayoutReset } from '../SlotPlacement';
import { LogoSection } from '../LogoSection';

/**
 * What each colour paints, said plainly (D-126) — "please confirm that all the
 * individual settings and labels are correct". Every design is held to these
 * meanings by the library's tests: the ground is Background, words are Text,
 * and lettering on accent shapes is worked out from the Accent, not borrowed
 * from the Background.
 */
const ROLE_LABELS: Record<PaletteRole, string> = {
  bg: 'Background',
  surface: 'Cards and panels',
  ink: 'Text',
  inkMuted: 'Secondary text',
  accent: 'Accent — buttons, highlights',
};

const BACKGROUND_LABELS: Record<BackgroundTreatment, string> = {
  solid: 'Colour',
  gradient: 'Gradient',
  pattern: 'Pattern',
  blurredPhoto: 'Blurred photo',
  picture: 'Your picture',
};

/** §8.4. */
export function LookTab({ template }: { template: SceneTemplate | null }): React.JSX.Element {
  const dispatch = useEditor((s) => s.dispatch);
  const look = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.look);
  const durationMs = useEditor((s) => s.project.scenes[s.selectedScene]?.durationMs ?? 10_000);
  const selectedLogo = useEditor((s) => s.selectedLogo);

  // Picking the logo on the canvas opens Look; this brings its controls into view.
  useEffect(() => {
    if (!selectedLogo) return;
    document.querySelector('[data-logo-section]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [selectedLogo]);

  // "Background" from the tool strip or the canvas menu (D-120): its section, in view.
  const focus = useOverlays((o) => o.inspectorSection);
  useEffect(() => {
    if (focus === null) return;
    const section = document.querySelector(`[data-inspector-section="${focus}"]`)?.closest('section');
    section?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    useOverlays.getState().focusInspectorSection(null);
  }, [focus]);

  if (!look) return <EmptyNote>No scene.</EmptyNote>;

  const offered = new Set((template?.look.palettes ?? []).map((p) => p.id));
  const looks = LOOK_PRESETS.filter((look) => offered.has(look.id));
  const backgrounds = template?.look.backgrounds ?? ['solid'];

  return (
    <div>
      <MyBrandSection />

      {looks.length > 0 && <LooksSection looks={looks} />}

      <BackgroundSection backgrounds={backgrounds} />

      <Section title="Colours">
        <div className="flex flex-col gap-1.5">
          {PALETTE_ROLES.map((role) => (
            <ColorField
              key={role}
              label={ROLE_LABELS[role]}
              value={look.palette[role]}
              onChange={(color) => { dispatch(actions.setPaletteRole(role, color)); }}
            />
          ))}
        </div>
      </Section>

      <LogoSection template={template} />

      <Section title="Texture">
        {template?.look.supportsGrain === false ? (
          <EmptyNote>This template does not use grain.</EmptyNote>
        ) : (
          <Slider
            label="Grain"
            value={Math.round(look.grain * 100)}
            min={0}
            max={100}
            suffix="%"
            onChange={(pct) => { dispatch(actions.setGrain(pct / 100)); }}
          />
        )}
        {template?.look.supportsVignette !== false && (
          <Slider
            label="Vignette"
            value={Math.round(look.vignette * 100)}
            min={0}
            max={100}
            suffix="%"
            onChange={(pct) => { dispatch(actions.setVignette(pct / 100)); }}
          />
        )}
        {template?.look.supportsCornerRadius !== false && (
          <Slider
            label="Corner radius"
            value={look.cornerRadius}
            min={0}
            max={160}
            onChange={(cornerRadius) => { dispatch(actions.setCornerRadius(cornerRadius)); }}
          />
        )}
      </Section>

      <Section title="Timing">
        <Slider
          label="Duration"
          value={Math.round(durationMs / 100) / 10}
          min={(template?.minDurationMs ?? 3000) / 1000}
          max={(template?.maxDurationMs ?? 30000) / 1000}
          step={0.5}
          suffix="s"
          onChange={(seconds) => {
            dispatch(
              actions.setDuration(seconds * 1000, {
                min: template?.minDurationMs ?? 3000,
                max: template?.maxDurationMs ?? 30000,
              }),
            );
          }}
        />
      </Section>

      <SceneLayoutReset />
    </div>
  );
}

/**
 * The background, first in Style (D-120): what is behind the design — a
 * colour, a gradient, a pattern, a blur of the first photo, or a picture of
 * the person's own — and its colour, without going through the palette.
 */
function BackgroundSection({ backgrounds }: { backgrounds: readonly BackgroundTreatment[] }): React.JSX.Element | null {
  const dispatch = useEditor((s) => s.dispatch);
  const look = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.look);
  const scenes = useEditor((s) => s.project.scenes.length);
  const showToast = useEditor((s) => s.showToast);
  const openPhotoPicker = useOverlays((o) => o.openPhotoPicker);
  const store = useMediaStore();
  useMediaRevision();
  if (!look) return null;

  const fixed = backgrounds.length === 1;
  const picture = look.background === 'picture' ? look.backgroundMediaId : undefined;
  const pictureUrl = picture === undefined ? null : store.previewUrl(picture);

  return (
    <Section title="Background">
      <div data-inspector-section="Background" className="flex flex-col gap-2">
        {fixed ? (
          <EmptyNote>This design fills the frame with your photo, so the colour shows only round its edges.</EmptyNote>
        ) : (
          <Segmented
            label="Behind the design"
            value={look.background}
            columns={2}
            options={backgrounds.map((b) => ({ value: b, label: BACKGROUND_LABELS[b] }))}
            onChange={(background) => {
              // A picture needs choosing first; it takes effect once there is one.
              if (background === 'picture' && look.backgroundMediaId === undefined) {
                openPhotoPicker({ kind: 'background' });
                return;
              }
              dispatch(actions.setBackground(background));
            }}
          />
        )}
        {look.background === 'picture' && (
          <div className="flex items-center gap-2">
            {pictureUrl !== null && (
              <img src={pictureUrl} alt="Background picture" className="size-12 shrink-0 rounded-md border border-edge object-cover" />
            )}
            <button
              type="button"
              onClick={() => { openPhotoPicker({ kind: 'background' }); }}
              className="flex-1 rounded-md border border-edge px-2 py-1.5 text-[12px] font-semibold hover:bg-panel-alt"
            >
              {picture === undefined ? 'Choose a picture…' : 'Change picture…'}
            </button>
          </div>
        )}
        {look.background === 'picture' && picture !== undefined && (
          <Slider
            label="Dim"
            value={Math.round((look.backgroundDim ?? DEFAULT_BACKGROUND_DIM) * 100)}
            min={0}
            max={90}
            suffix="%"
            onChange={(pct) => { dispatch(actions.setBackgroundDim(pct / 100)); }}
          />
        )}
        {look.background !== 'blurredPhoto' && (
          <ColorField
            label={look.background === 'picture' ? 'Dim colour' : 'Background colour'}
            value={look.palette.bg}
            onChange={(color) => { dispatch(actions.setPaletteRole('bg', color)); }}
          />
        )}
        {(look.background === 'gradient' || look.background === 'pattern') && (
          <>
            <ColorField
              label="Second colour"
              value={look.palette.surface}
              onChange={(color) => { dispatch(actions.setPaletteRole('surface', color)); }}
            />
            <p className="-mt-1 text-[10px] text-ink-faint">The gradient's other end — also the colour of cards and panels.</p>
          </>
        )}
        {scenes > 1 && (
          <button
            type="button"
            onClick={() => {
              dispatch(actions.backgroundOnEveryScene());
              showToast('Every scene has this background now. Undo takes it back.');
            }}
            className="rounded-md border border-edge px-2 py-1.5 text-[12px] hover:bg-panel-alt"
          >
            Use on every scene
          </button>
        )}
      </div>
    </Section>
  );
}

/** Whether a scene's look is this preset's: its colours, and its ground unless the ground is the person's picture. */
function isLook(look: LookSettings, preset: LookPreset): boolean {
  return PALETTE_ROLES.every((role) => preset.palette[role] === look.palette[role])
    && (look.background === 'picture' || look.background === preset.background);
}

/** How a look's ground reads at swatch size. */
function swatchGround(preset: LookPreset): string {
  const { bg, surface } = preset.palette;
  if (preset.background === 'gradient') return `linear-gradient(112deg, ${surface}, ${bg})`;
  if (preset.background === 'pattern') return `radial-gradient(circle, ${surface} 0, ${bg} 50%, ${surface}80 52%, ${bg} 100%)`;
  return bg;
}

/**
 * Looks (D-121): the same design restyled in one tap — light, cream,
 * coloured or dark — and a button that steps through them, for "quick
 * formatting of the same template". Each swatch is the look itself: its
 * ground, its words in its ink, a card in its surface, its accent.
 */
function LooksSection({ looks }: { looks: readonly LookPreset[] }): React.JSX.Element | null {
  const dispatch = useEditor((s) => s.dispatch);
  const look = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.look);
  if (!look) return null;
  const current = looks.findIndex((preset) => isLook(look, preset));
  const next = looks[(current + 1) % looks.length];

  return (
    <Section title="Looks">
      <div data-inspector-section="Looks">
        <div className="mb-2 flex items-center justify-between gap-2">
          <p className="text-[11px] text-ink-muted">The same design, in other colours.</p>
          {next && (
            <button
              type="button"
              data-next-look
              onClick={() => { dispatch(actions.applyLook(next)); }}
              className="shrink-0 rounded-md border border-edge px-2 py-1 text-[11px] font-semibold hover:bg-panel-alt"
              title={`Try ${next.label}`}
            >
              Try another
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-4 md:grid-cols-3" role="list" aria-label="Looks">
          {looks.map((preset) => {
            const active = isLook(look, preset);
            return (
              <button
                key={preset.id}
                type="button"
                role="listitem"
                data-look={preset.id}
                onClick={() => { dispatch(actions.applyLook(preset)); }}
                aria-pressed={active}
                aria-label={`${preset.label} look`}
                className="overflow-hidden rounded-md border-2 text-left"
                style={{ borderColor: active ? 'var(--c-accent)' : 'transparent', boxShadow: active ? 'none' : 'inset 0 0 0 1px var(--c-edge)' }}
              >
                <span className="relative block h-12 w-full" style={{ background: swatchGround(preset) }}>
                  <span className="absolute left-1.5 top-1 text-[15px] font-extrabold leading-none" style={{ color: preset.palette.ink }}>Aa</span>
                  <span className="absolute bottom-1.5 left-1.5 h-1 w-5 rounded-full" style={{ background: preset.palette.accent }} />
                  <span className="absolute bottom-1.5 right-1.5 h-5 w-6 rounded-sm" style={{ background: preset.palette.surface, boxShadow: `inset 0 0 0 1px ${preset.palette.inkMuted}40` }} />
                </span>
                <span className="block truncate bg-panel px-1 py-0.5 text-[10px] text-ink-muted">{preset.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </Section>
  );
}

/**
 * My brand (D-134): save this design's colours, ground and logo once; put
 * them on any design — every scene of it — in one tap.
 */
function MyBrandSection(): React.JSX.Element | null {
  const kit = useBrandKit();
  const dispatch = useEditor((s) => s.dispatch);
  const showToast = useEditor((s) => s.showToast);
  const look = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.look);
  const logo = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.logo);
  const scenes = useEditor((s) => s.project.scenes.length);
  const store = useMediaStore();
  useMediaRevision();
  if (!look || !logo) return null;

  const save = (): void => {
    saveBrandKit({
      look: { palette: look.palette, background: look.background === 'picture' ? 'gradient' : look.background, vignette: look.vignette },
      logo: logo.mediaId === null ? null : logo,
      savedAt: Date.now(),
    });
    showToast(logo.mediaId === null ? 'Saved as your brand: these colours. Add a logo in Style and save again to include it.' : 'Saved as your brand: these colours and your logo.');
  };

  const use = (): void => {
    if (!kit) return;
    const id = kit.logo?.mediaId ?? null;
    // The logo's picture is on this device; bring it in if this project has not used it yet.
    void (id === null ? Promise.resolve({ missing: [] as readonly string[] }) : restoreMedia(store, [id]))
      .then(({ missing }) => {
        dispatch(actions.applyBrand(kit.look, missing.length > 0 ? null : kit.logo));
        showToast(missing.length > 0
          ? 'Your brand colours are on. The logo could not be found on this device — add it again in Style.'
          : scenes > 1 ? `Your brand is on all ${scenes} scenes. Undo takes it off.` : 'Your brand is on. Undo takes it off.');
      })
      .catch((error: unknown) => {
        console.error('Could not apply the brand.', error);
        showToast('Could not apply your brand. Try again.');
      });
  };

  const logoUrl = kit?.logo?.mediaId ? store.previewUrl(kit.logo.mediaId) : null;

  return (
    <Section title="My brand">
      <div data-my-brand>
        {kit === null ? (
          <>
            <p className="mb-2 text-[11px] leading-relaxed text-ink-muted">
              Save your colours and logo once, then put them on any design in one tap.
            </p>
            <Button variant="accent" onClick={save}>Save this as my brand</Button>
          </>
        ) : (
          <>
            <div className="mb-2 flex items-center gap-2">
              <span className="flex overflow-hidden rounded-md border border-edge" aria-label="Your brand colours">
                {PALETTE_ROLES.map((role) => <span key={role} className="block size-6" style={{ background: kit.look.palette[role] }} />)}
              </span>
              {logoUrl !== null && <img src={logoUrl} alt="Your logo" className="size-8 rounded-md border border-edge object-contain" style={{ background: kit.look.palette.bg }} />}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <Button variant="accent" onClick={use}>{scenes > 1 ? 'Use my brand on every scene' : 'Use my brand'}</Button>
              <Button onClick={save}>Save this instead</Button>
              <Button onClick={() => { saveBrandKit(null); showToast('Your saved brand is gone from this device.'); }}>Forget</Button>
            </div>
          </>
        )}
      </div>
    </Section>
  );
}
