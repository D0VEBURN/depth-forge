// Browser adapter for Signal Forge Depth Anything V2.
// The model downloads from Hugging Face on first use, then Transformers.js/ONNX Runtime
// caches model assets in the browser when supported. Inference happens in the browser.
(() => {
  let transformersPromise = null;
  let depthPipe = null;
  let depthLoading = null;

  async function getTransformers(){
    if (!transformersPromise) {
      transformersPromise = import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/+esm');
    }
    return transformersPromise;
  }

  async function getDepthPipe(){
    if (depthPipe) return depthPipe;
    if (depthLoading) return depthLoading;
    depthLoading = (async () => {
      const { pipeline, env } = await getTransformers();
      env.allowRemoteModels = true;
      env.allowLocalModels = false;
      // Prefer browser cache. Transformers.js selects WebGPU where available and WASM otherwise.
      env.useBrowserCache = true;
      depthPipe = await pipeline(
        'depth-estimation',
        'onnx-community/depth-anything-v2-small',
        { dtype: 'q8', device: ('gpu' in navigator) ? 'webgpu' : 'wasm' }
      );
      return depthPipe;
    })();
    try { return await depthLoading; }
    finally { depthLoading = null; }
  }

  window.signalForge = {
    async depthStatus(){
      return { ready: !!depthPipe, loading: !!depthLoading, browser: true };
    },
    async runDepth(payload){
      try {
        const { RawImage } = await getTransformers();
        const pipe = await getDepthPipe();
        const width = Number(payload.width);
        const height = Number(payload.height);
        const rgba = new Uint8Array(payload.rgba);
        const img = new RawImage(rgba, width, height, 4).rgb();
        const result = await pipe(img);
        if (result?.predicted_depth?.data) {
          const data = result.predicted_depth.data;
          const dims = result.predicted_depth.dims || [];
          const h = dims[dims.length - 2] || height;
          const w = dims[dims.length - 1] || width;
          return { ok: true, width: w, height: h, values: Array.from(data) };
        }
        if (result?.depth?.data) {
          return { ok: true, width: result.depth.width, height: result.depth.height, bytes: Array.from(result.depth.data), normalized: true };
        }
        return { ok: false, error: 'Depth model returned no depth field.' };
      } catch (error) {
        console.error('Browser depth inference failed:', error);
        return { ok: false, error: String(error?.message || error) };
      }
    }
  };
})();
