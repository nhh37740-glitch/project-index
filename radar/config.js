window.DEMO_CONFIG = {
  // Self-contained Web assets; no Oxford dataset mount is required at runtime.
  radarImageDirectory: "./assets/radar/",

  // Pre-rendered RGB frames matched to the radar timestamps.
  stereoImageDirectory: "./assets/stereo/",

  // Generated only from deterministic synthetic geometry by tools/generate_synthetic.py.
  poseDataScript: "./data/method_comparison_jan15_cfear_lite_pose_data.js",

  // The published demo contains synthetic frames numbered from zero.
  startFrame: 0,
  frameCount: 240,
  intervalMs: 50,
  // Shared local map width for Ground Truth and all six comparison panels.
  mapSpanMetres: 128,
};
