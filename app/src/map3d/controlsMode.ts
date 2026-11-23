export type Action = "rotate" | "pan" | "dolly" | null;
export type ControlsConfig = { left: Action; middle: Action; right: Action; oneFinger: Action; twoFingers: "dolly-rotate" | "dolly-pan" };

/** Which camera action each input performs. In Edit mode the left button and one finger belong to the paint tools. */
export function controlsConfig(editing: boolean, spaceHeld: boolean): ControlsConfig {
  if (!editing) return { left: "rotate", middle: "dolly", right: "pan", oneFinger: "rotate", twoFingers: "dolly-pan" };
  return { left: spaceHeld ? "pan" : null, middle: "pan", right: "rotate", oneFinger: null, twoFingers: "dolly-rotate" };
}
