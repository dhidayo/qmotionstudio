import { ConfirmDialog } from './ConfirmDialog';
import { closeImageQuestion, confirmImage, imageQuestion, useImageQuestion } from './switchMode';

/**
 * "Switch to Image mode?" (D-168), asked before a video of more than one
 * scene, or with sound, becomes an image. Stay in Video is what Escape and a
 * click outside do: the answer that changes nothing.
 */
export function ImageModeConfirm(): React.JSX.Element | null {
  const loss = useImageQuestion();
  if (loss === null) return null;
  return (
    <ConfirmDialog
      title="Switch to Image mode?"
      testId="image-mode"
      onCancel={closeImageQuestion}
      choices={[
        { label: 'Switch to Image', primary: true, onSelect: confirmImage },
        { label: 'Stay in Video', onSelect: closeImageQuestion },
      ]}
    >
      <p>{imageQuestion(loss)}</p>
    </ConfirmDialog>
  );
}
