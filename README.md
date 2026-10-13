# Depth Forge — GitHub Pages edition

A standalone **Depth Map / Echo Scan** image and video editor, designed for GitHub Pages. Uses the Depth Anything V2 Small ONNX model in the browser via Transformers.js.

## Publish

1. Open your empty `D0VEBURN/depth-forge` GitHub repository.
2. Upload **the files inside this folder**, not the enclosing folder, to the root of the `main` branch.
3. Under **Settings → Pages**, choose **Deploy from a branch**, `main`, `/(root)`, and save.
4. Open the GitHub Pages URL once deployment completes.

No npm install or server is required on GitHub Pages. Local testing needs an HTTP server (`python -m http.server 8000`) rather than opening `index.html` via `file://`.

## Workflow

- Import PNG/JPG/WebP or a browser-playable video (MP4 and some MOV/WebM files).
- Choose Depth Map or Echo Scan; tune the sliders.
- Preview the effect. Video preview estimates depth at reduced resolution and updates periodically, so preview can skip frames on slower machines.
- **Export PNG Frame** for an image or the current video frame.
- **Render MP4 Video** to process frames sequentially and encode them to H.264 MP4. For an imported still image, it creates a 5-second clip, useful for animated echo scans.
- Cancel a render using the Cancel button.

## Important limitations

- **Video output is silent** in this initial browser edition. The source audio is **not preserved**. Adding audio muxing requires an additional processing stage.
- Browser video import is codec-dependent. iPhone HEVC/HDR MOV may need conversion to H.264 MP4 first.
- The first depth use downloads the model from Hugging Face; later runs can use browser cache. Inference itself runs on-device (WebGPU where supported, otherwise WASM).
- Video export is **not screen recording**: it seeks through frames, runs depth inference per frame, and encodes the results with WebCodecs + mp4-muxer. It can be much slower than real-time, particularly on CPU or for long clips.
- MP4 rendering requires a Chromium-based browser with H.264 WebCodecs support (Chrome/Edge). The mp4-muxer library loads from jsDelivr when exporting.
- This is a first implementation and has not been end-to-end tested in a browser in this environment. Try a short video before processing long footage.

## License and dependencies

Depth model: `onnx-community/depth-anything-v2-small` hosted on Hugging Face; check its upstream license before commercial use.
External dependencies loaded on demand from CDN: Transformers.js 3.8.1 and mp4-muxer 5.2.2.
