import { aspectPosterUrl, posterUrl } from '@/templates/manifest';
import { useEditor } from '@/state/store';
import { ConfirmDialog } from '@/ui/shell/ConfirmDialog';
import { useLayout } from '@/ui/shell/useLayout';
import { useProjectActions } from '@/ui/projects/useProjectActions';
import { useSceneStills } from '@/ui/timeline/useSceneStills';
import { closeWelcomeBack, useWelcomeBack } from './welcomeBack';

/**
 * "Welcome back" (D-168): "I think it would be nice to have a popup if an
 * existing design exists to ask if user would like to discard existing design
 * or start a new one. You can also let them know they can save the design."
 *
 * Continue editing is first and is what Escape does. Start a new design is
 * the menu's own New image or New video, in the mode of the design left, so
 * the design stays in Projects, saved — nothing is deleted here. There is no
 * "discard": deleting a project cannot be undone, and this window is the one
 * place someone might press it without having meant to.
 */

/** "today at 14:05", "yesterday at 09:30", "on 3 November", "on 3 November 2025". */
export function whenChanged(savedAt: number, now = Date.now()): string {
  const then = new Date(savedAt);
  const time = then.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const day = (at: Date): number => new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
  const days = Math.round((day(new Date(now)) - day(then)) / 86_400_000);
  if (days <= 0) return `today at ${time}`;
  if (days === 1) return `yesterday at ${time}`;
  const sameYear = then.getFullYear() === new Date(now).getFullYear();
  return `on ${then.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', ...(sameYear ? {} : { year: 'numeric' }) })}`;
}

function Picture(): React.JSX.Element | null {
  const project = useEditor((s) => s.project);
  const stills = useSceneStills(project);
  const scene = project.scenes[0];
  if (!scene) return null;
  const [w, h] = project.aspect.split(':').map(Number);
  const ratio = (w ?? 1) / (h ?? 1);
  // The scene's own still once drawn; until then the design's library picture.
  const src = stills.get(scene.id) ?? aspectPosterUrl(scene.templateId, project.aspect);
  return (
    <img
      src={src}
      alt=""
      data-welcome-picture
      className="shrink-0 rounded-md border border-edge object-cover"
      style={ratio >= 1 ? { width: 96, height: Math.round(96 / ratio) } : { height: 104, width: Math.round(104 * ratio) }}
      onError={(e) => { if (!e.currentTarget.src.includes(`/thumbs/${scene.templateId}.webp`)) e.currentTarget.src = posterUrl(scene.templateId); }}
    />
  );
}

export function WelcomeBackDialog(): React.JSX.Element | null {
  const offer = useWelcomeBack();
  const name = useEditor((s) => s.project.name);
  const mode = useEditor((s) => s.project.mode);
  const { startNew } = useProjectActions();
  const phone = useLayout() === 'phone';
  if (offer === null) return null;

  return (
    <ConfirmDialog
      title="Welcome back"
      testId="welcome-back"
      aside={<Picture />}
      onCancel={closeWelcomeBack}
      choices={[
        { label: 'Continue editing', primary: true, onSelect: closeWelcomeBack },
        {
          label: 'Start a new design',
          onSelect: () => {
            closeWelcomeBack();
            void startNew(mode === 'motionAd' ? 'blank' : 'template');
          },
        },
      ]}
    >
      <p>
        <span className="font-semibold text-ink">{name}</span> was last changed {whenChanged(offer.savedAt)}.
      </p>
      {/* Where the project list is found on this device: "Switch project" at the top, or the phone menu's Open…. */}
      <p>Your designs save automatically on this device. Open them any time from {phone ? 'Open… in the menu' : 'Switch project, at the top'}.</p>
    </ConfirmDialog>
  );
}
