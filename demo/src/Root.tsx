import React from "react";
import { Composition, Still } from "remotion";
import { Demo, DURATION } from "./Video";
import { Title } from "./scenes/Title";
import { FPS } from "./theme";

export const RemotionRoot: React.FC = () => (
  <>
    {/* The submission video: 1920x1080, ~90 seconds. */}
    <Composition id="Demo" component={Demo} durationInFrames={DURATION} fps={FPS} width={1920} height={1080} />

    {/* Square cut for LinkedIn and X, where 16:9 gets letterboxed into nothing. */}
    <Composition
      id="DemoSquare"
      component={Demo}
      durationInFrames={DURATION}
      fps={FPS}
      width={1080}
      height={1080}
    />

    {/* Cover image for the lablab.ai submission. */}
    <Still id="Cover" component={Title} width={1920} height={1080} />
  </>
);
