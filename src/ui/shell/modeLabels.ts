import type { ProjectMode } from '@/document/types';
import { MODE_LABEL } from '@/document/modeNames';

export { MODE_LABEL };

/**
 * Every word that changes with the mode, in one table (D-155).
 *
 * "There are two modes … I need the name to speak to exactly what they are."
 * Image is one design that plays once and saves as a picture (or a short
 * clip); Video is scenes in order and saves as a video. The words follow from
 * that: in Image the library holds *designs*; in Video it holds *video
 * templates* — whole videos of several scenes — and a *scene* is one place in
 * the video, added with Add a scene. Keeping every label here means the next
 * rename is a few lines, and no screen can drift into the old wording.
 */
export type ModeCopy = {
  /** The mode's name: the top bar's switch and the phone menu. */
  readonly label: string;
  /** What the mode is, for the switch's tooltip. */
  readonly hint: string;
  /** The phone menu's line under the name. */
  readonly subtitle: string;
  /** The start row's first button, and the library sheet's title. */
  readonly choose: string;
  /** The same, short enough for a phone's three-column row. */
  readonly chooseShort: string;
  /** The first button's tooltip: what choosing one does. */
  readonly chooseHint: string;
  /**
   * The start row's "Add a scene", which only a video has (D-155): "after
   * choose a design, you should have Add a scene, and add your photos to
   * differentiate these". Null in Image, which is one scene.
   */
  readonly addScene: string | null;
  /** The library tool in the tool strip and the phone toolbar. */
  readonly tool: string;
  /** The library preview's button. */
  readonly use: string;
  /** The menu item that starts a new project in this mode, and its hint. */
  readonly newProject: string;
  readonly newHint: string;
  /** Said once a new project in this mode has opened. */
  readonly started: string;
  /**
   * The quick start's "choose" step in this mode, when it is not the
   * purpose's own words (null): those are about designs, and in Video the
   * button chooses a whole video.
   */
  readonly tourChoose: { readonly wide: string; readonly phone: string } | null;
  /** The quick start's last step, and its closing line. */
  readonly exportStep: string;
  readonly finished: string;
};

export const MODE_COPY: Readonly<Record<ProjectMode, ModeCopy>> = {
  showcase: {
    label: MODE_LABEL.showcase,
    hint: 'One design — a post, a thumbnail, a cover. It plays once, then saves as an image or a short clip.',
    subtitle: 'One design · image or clip',
    choose: 'Choose a design',
    chooseShort: 'Choose a design',
    chooseHint: 'Pick a design for this image. Your photos and words carry over.',
    addScene: null,
    tool: 'Designs',
    use: 'Use this design',
    newProject: 'New image',
    newHint: 'A post, a thumbnail, a cover',
    started: 'New image started.',
    tourChoose: null,
    exportStep: 'Export your image',
    finished: 'You made your first image',
  },
  motionAd: {
    label: MODE_LABEL.motionAd,
    hint: 'Scenes in order — with transitions, layers and music. Saves as a video.',
    subtitle: 'Scenes, layers, music',
    choose: 'Choose a video template',
    chooseShort: 'Video template',
    chooseHint: 'A whole video of several scenes, ready for your photos and words. It replaces the scenes you have.',
    addScene: 'Add a scene',
    tool: 'Templates',
    use: 'Use this video template',
    newProject: 'New video',
    newHint: 'Scenes in order',
    started: 'New video. Add scenes — new ones or your saved images — and layers from the timeline.',
    tourChoose: {
      wide: 'Click here and pick a video template — several scenes, ready for your photos and words. To add one scene at a time, use Add a scene.',
      phone: 'Tap here and pick a video template — several scenes, ready for your photos and words. Add a scene adds one at a time.',
    },
    exportStep: 'Export your video',
    finished: 'You made your first video',
  },
};
