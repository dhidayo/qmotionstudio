import { useCallback, useRef } from 'react';
import * as actions from '@/document/actions';
import { LOGO_KEY, type LockupPosition, type LogoPlacement } from '@/document/types';
import { LOCKUP_SIZE_DEFAULT } from '@/core/render/logo';
import { useEditor } from '@/state/store';
import type { SceneTemplate } from '@/templates/schema';
import { useMediaRevision, useMediaStore } from '@/ui/media/MediaProvider';
import { ACCEPT_ATTRIBUTE, useUpload } from '@/ui/media/useUpload';
import { ElementEffectsEditor } from '@/ui/effects/EffectEditors';
import { Button, ColorField, EmptyNote, Section, Segmented, Slider, TextInput, Toggle } from './controls';

const PLACEMENTS: readonly { value: LogoPlacement; label: string }[] = [
  { value: 'topLeft', label: 'Top left' },
  { value: 'topRight', label: 'Top right' },
  { value: 'center', label: 'Centre' },
  { value: 'bottomLeft', label: 'Bottom left' },
  { value: 'bottomRight', label: 'Bottom right' },
  { value: 'free', label: 'Free' },
];

const LOCKUP_POSITIONS: readonly { value: LockupPosition; label: string }[] = [
  { value: 'below', label: 'Below' },
  { value: 'above', label: 'Above' },
  { value: 'right', label: 'Right' },
  { value: 'left', label: 'Left' },
];

/**
 * §8.3's logo, as part of the Look (D-105).
 *
 * It had a tab of its own, apart from the colours and background it sits on —
 * "I do not see a reason why they are apart". A logo is part of how a piece
 * looks, so it lives with the rest of the look, in both Lifestyle and
 * Corporate Ads, with its own effects beside it.
 */
export function LogoSection({ template }: { template: SceneTemplate | null }): React.JSX.Element | null {
  const store = useMediaStore();
  // Above the early returns below: hooks have to run in the same order every render.
  useMediaRevision();
  const dispatch = useEditor((s) => s.dispatch);
  const showToast = useEditor((s) => s.showToast);
  const logo = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.logo);
  const effects = useEditor((s) => s.project.scenes[s.selectedScene]?.inputs.elementEffects?.[LOGO_KEY]) ?? [];
  const sceneCount = useEditor((s) => s.project.scenes.length);
  const fileInput = useRef<HTMLInputElement>(null);

  const onAdded = useCallback(
    (mediaIds: string[]) => {
      const first = mediaIds[0];
      if (first !== undefined) dispatch(actions.setLogoMedia(first));
    },
    [dispatch],
  );
  const { state: upload, addFiles } = useUpload(store, onAdded, { artboardLongestEdge: 1920 });

  if (!logo) return null;

  if (template && !template.supportsLogo) {
    return (
      <Section title="Logo">
        <EmptyNote>This template does not place a logo.</EmptyNote>
      </Section>
    );
  }

  const preview = logo.mediaId === null ? null : store.previewUrl(logo.mediaId);

  return (
    <div data-logo-section>
      <Section title="Logo">
        <button
          type="button"
          onClick={() => { fileInput.current?.click(); }}
          className="w-full cursor-pointer rounded-md border border-dashed px-3 py-4 text-center"
          style={{ borderColor: 'var(--c-edge-strong)' }}
        >
          {preview === null ? (
            <>
              <p className="text-[12px] font-medium">{upload.busy ? 'Reading…' : 'Add a logo'}</p>
              <p className="mt-0.5 text-[10px] text-ink-faint">PNG with transparency works best.</p>
            </>
          ) : (
            <img src={preview} alt="Logo" className="mx-auto max-h-16 object-contain" />
          )}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          hidden
          aria-label="Add a logo"
          onChange={(e) => {
            void addFiles([...(e.target.files ?? [])]);
            e.target.value = '';
          }}
        />

        {upload.error !== null && (
          <p className="mt-2 text-[11px]" style={{ color: 'var(--c-danger)' }}>{upload.error}</p>
        )}

        {logo.mediaId !== null && (
          <div className="mt-2 flex gap-1">
            <Button onClick={() => { dispatch(actions.resetLogo()); }}>Reset</Button>
            <Button variant="danger" onClick={() => { dispatch(actions.setLogoMedia(null)); }}>Remove</Button>
          </div>
        )}
        {logo.mediaId !== null && sceneCount > 1 && (
          <div className="mt-1 flex">
            <Button
              onClick={() => {
                dispatch(actions.applyLogoToAllScenes());
                showToast(`The logo is now on all ${sceneCount} scenes, placed the same way.`);
              }}
            >
              Use on every scene
            </Button>
          </div>
        )}
      </Section>

      {logo.mediaId !== null && (
        <>
          <Section title="Logo placement">
            <Segmented
              label="Position"
              value={logo.placement}
              columns={3}
              options={PLACEMENTS}
              onChange={(placement) => { dispatch(actions.setLogoPlacement(placement)); }}
            />
            <EmptyNote>
              {logo.placement === 'free'
                ? 'Drag the logo on the canvas to place it; its lockup comes with it.'
                : 'Or drag it on the canvas to place it anywhere.'}
            </EmptyNote>
            <Slider
              label="Size"
              value={logo.sizePct}
              min={2}
              max={40}
              suffix="%"
              onChange={(sizePct) => { dispatch(actions.setLogoSize(sizePct)); }}
            />
            <Slider
              label="Opacity"
              value={Math.round(logo.opacity * 100)}
              min={0}
              max={100}
              suffix="%"
              onChange={(pct) => { dispatch(actions.setLogoOpacity(pct / 100)); }}
            />
          </Section>

          <Section title="Lockup">
            <Toggle
              label="Pair with a text mark"
              checked={logo.lockup}
              onChange={(lockup) => { dispatch(actions.setLogoLockup(lockup)); }}
            />
            {logo.lockup && (
              <div className="mt-2">
                <TextInput
                  label="Lockup text"
                  value={logo.lockupText}
                  placeholder="Your name"
                  maxLength={30}
                  onChange={(text) => { dispatch(actions.setLockupText(text)); }}
                />
                <div className="mt-2">
                  <Segmented
                    label="Text sits"
                    value={logo.lockupPosition ?? 'below'}
                    options={LOCKUP_POSITIONS}
                    onChange={(position) => { dispatch(actions.setLockupPosition(position)); }}
                  />
                  <Slider
                    label="Text size"
                    value={logo.lockupSizePct ?? LOCKUP_SIZE_DEFAULT}
                    min={10}
                    max={80}
                    suffix="%"
                    onChange={(pct) => { dispatch(actions.setLockupSize(pct)); }}
                  />
                  <div className="flex items-center gap-2">
                    <div className="flex-1">
                      <ColorField
                        label="Text colour"
                        value={logo.lockupColor !== undefined && logo.lockupColor.length > 0 ? logo.lockupColor : '#ffffff'}
                        onChange={(color) => { dispatch(actions.setLockupColor(color)); }}
                      />
                    </div>
                    {logo.lockupColor !== undefined && logo.lockupColor.length > 0 && (
                      <button
                        type="button"
                        onClick={() => { dispatch(actions.setLockupColor('')); }}
                        className="text-[10px] text-ink-faint hover:text-ink"
                      >
                        Use ink
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </Section>

          <Section title="Logo effects">
            <ElementEffectsEditor target={{ kind: 'logo' }} label="the logo" effects={effects} />
          </Section>
        </>
      )}
    </div>
  );
}
