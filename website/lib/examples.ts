export type DemoExample = {
  id: string;
  src: string;
  titleKey: string;
  metaKey: string;
};

export const DEMO_EXAMPLES: DemoExample[] = [
  {
    id: "ambient",
    src: "/examples/ambient-cot-demo.wav",
    titleKey: "items.ambient.title",
    metaKey: "items.ambient.meta",
  },
  {
    id: "piano",
    src: "/examples/piano-roll-sketch.wav",
    titleKey: "items.piano.title",
    metaKey: "items.piano.meta",
  },
  {
    id: "stems",
    src: "/examples/stem-bed-demo.wav",
    titleKey: "items.stems.title",
    metaKey: "items.stems.meta",
  },
  {
    id: "mix",
    src: "/examples/mix-clip-loop.wav",
    titleKey: "items.mix.title",
    metaKey: "items.mix.meta",
  },
  {
    id: "ab",
    src: "/examples/candidate-ab-demo.wav",
    titleKey: "items.ab.title",
    metaKey: "items.ab.meta",
  },
];
