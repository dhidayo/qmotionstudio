import { useCallback, useRef } from 'react';
import * as actions from '@/document/actions';
import type { LogoPlacement } from '@/document/types';
import { useEditor } from '@/state/store';
import type { SceneTemplate } from '@/templates/schema';
import { useMediaStore } from '@/ui/media/MediaProvider';
import { ACCEPT_ATTRIBUTE, useUpload } from '@/ui/media/useUpload';
import { Button, EmptyNote, Row, Section, Segmented, Slider, TextInput, Toggle } from '../controls';

const PLACEMENTS: readonly { value: LogoPlacement; label: string }[] = [
  { value: 'topLeft', label: 'Top left' },
  { value: 'topRight', label: 'Top right' },
  { value: 'center', label: 'Centre' },
  { value: 'bottomLeft', label: 'Bottom left' },
  { value: 'bottomRight', label: 'Bottom right' },
  { value: 'free', label: 'Free' },
];

/** §8.3. */
export function LogoTab({ template }: { template: SceneTemplate | null }): React.JSX.Element {
  const store = useMediaStore();
  const dispatch = useEditor((s) => s.dispatch);
  const logo = useEditor((s) => s.project.scenes[0]?.inputs.logo);
  const fileInput = useRef<HTMLInputElement>(null);

  const onAdded = useCallback(
    (mediaIds: string[]) => {
      const first = mediaIds[0];
      if (first !== undefined) dispatch(actions.setLogoMedia(first));
    },
    [dispatch],
  );
  const { state: upload, addFiles } = useUpload(store, onAdded, { artboardLongestEdge: 1920 });

  if (!logo) return <EmptyNote>No scene.</EmptyNote>;

  if (template && !template.supportsLogo) {
    return (
      <Section>
        <EmptyNote>This template does not place a logo.</EmptyNote>
      </Section>
    );
  }

  const preview = logo.mediaId === null ? null : store.previewUrl(logo.mediaId);

  return (
    <div>
      <Section>
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
      </Section>

      {logo.mediaId === null ? (
        <Section title="Placement">
          <EmptyNote>Add a logo to place it.</EmptyNote>
        </Section>
      ) : (
        <>
          <Section title="Placement">
            <Segmented
              label="Position"
              value={logo.placement}
              columns={2}
              options={PLACEMENTS}
              onChange={(placement) => { dispatch(actions.setLogoPlacement(placement)); }}
            />
            {logo.placement === 'free' && (
              <EmptyNote>Drag the logo on the artboard to position it. Arrives with the canvas handles.</EmptyNote>
            )}
          </Section>

          <Section title="Appearance">
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
            <Row label="Pair with a text mark">
              <Toggle
                label="Lockup"
                checked={logo.lockup}
                onChange={(lockup) => { dispatch(actions.setLogoLockup(lockup)); }}
              />
            </Row>
            {logo.lockup && (
              <TextInput
                label="Lockup text"
                value={logo.lockupText}
                placeholder="Your name"
                maxLength={30}
                onChange={(text) => { dispatch(actions.setLockupText(text)); }}
              />
            )}
          </Section>
        </>
      )}
    </div>
  );
}
