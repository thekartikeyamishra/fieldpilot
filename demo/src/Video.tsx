import React from "react";
import { AbsoluteFill, Audio, Sequence, staticFile } from "remotion";
import { linearTiming, TransitionSeries } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { wipe } from "@remotion/transitions/wipe";
import { C, FPS, SCENES } from "./theme";
import { Hook } from "./scenes/Hook";
import { Problem } from "./scenes/Problem";
import { Title } from "./scenes/Title";
import { Speak } from "./scenes/Speak";
import { Evidence } from "./scenes/Evidence";
import { Approve } from "./scenes/Approve";
import { Architecture } from "./scenes/Architecture";
import { Economics } from "./scenes/Economics";
import { Close } from "./scenes/Close";

/**
 * Transitions carry meaning rather than decoration:
 *   fade  — a change of subject
 *   slide — moving forward through the same workflow
 *   wipe  — pulling back to reveal the layer underneath
 *
 * Every transition overlaps its neighbours, so TransitionSeries total runtime is
 * shorter than the sum of the scenes. That is expected, not a bug.
 */
const T = 18;

/** Optional voiceover. Drop a file at public/vo/voiceover.mp3 and it plays. */
const Voiceover: React.FC = () => {
  const [exists, setExists] = React.useState(false);
  React.useEffect(() => {
    fetch(staticFile("vo/voiceover.mp3"), { method: "HEAD" })
      .then((r) => setExists(r.ok))
      .catch(() => setExists(false));
  }, []);
  if (!exists) return null;
  return <Audio src={staticFile("vo/voiceover.mp3")} volume={1} />;
};

export const Demo: React.FC = () => (
  <AbsoluteFill style={{ background: C.ink }}>
    <Voiceover />
    <TransitionSeries>
      <TransitionSeries.Sequence durationInFrames={SCENES.hook}>
        <Hook />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />

      <TransitionSeries.Sequence durationInFrames={SCENES.problem}>
        <Problem />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={wipe({ direction: "from-bottom" })}
        timing={linearTiming({ durationInFrames: T })}
      />

      <TransitionSeries.Sequence durationInFrames={SCENES.title}>
        <Title />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />

      <TransitionSeries.Sequence durationInFrames={SCENES.speak}>
        <Speak />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: T })}
      />

      <TransitionSeries.Sequence durationInFrames={SCENES.evidence}>
        <Evidence />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={slide({ direction: "from-right" })}
        timing={linearTiming({ durationInFrames: T })}
      />

      <TransitionSeries.Sequence durationInFrames={SCENES.approve}>
        <Approve />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition
        presentation={wipe({ direction: "from-left" })}
        timing={linearTiming({ durationInFrames: T })}
      />

      <TransitionSeries.Sequence durationInFrames={SCENES.architecture}>
        <Architecture />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />

      <TransitionSeries.Sequence durationInFrames={SCENES.economics}>
        <Economics />
      </TransitionSeries.Sequence>
      <TransitionSeries.Transition presentation={fade()} timing={linearTiming({ durationInFrames: T })} />

      <TransitionSeries.Sequence durationInFrames={SCENES.close}>
        <Close />
      </TransitionSeries.Sequence>
    </TransitionSeries>

    {/* Whoosh on each cut. Placed on the timeline rather than inside scenes so
        the sound lands with the transition, not with a component mounting. */}
    {[
      SCENES.hook,
      SCENES.hook + SCENES.problem - T,
      SCENES.hook + SCENES.problem + SCENES.title - T * 2,
    ].map((at, i) => (
      <Sequence key={i} from={Math.max(0, at - T)} durationInFrames={T * 2}>
        <Audio src={staticFile("sfx/whoosh.wav")} volume={0.32} />
      </Sequence>
    ))}
  </AbsoluteFill>
);

export const DURATION = Object.values(SCENES).reduce((a, b) => a + b, 0) - T * 8;
export { FPS };
