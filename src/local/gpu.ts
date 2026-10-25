/** WebGPU availability, "f16" when the adapter has f16 shaders, null without WebGPU */
export async function webGpuSupport(): Promise<"f16" | "f32" | null> {
  const gpu = (
    navigator as Navigator & {
      gpu?: { requestAdapter(): Promise<{ features: Set<string> } | null> };
    }
  ).gpu;
  if (!gpu) return null;
  try {
    const adapter = await gpu.requestAdapter();
    if (!adapter) return null;
    return adapter.features.has("shader-f16") ? "f16" : "f32";
  } catch {
    return null;
  }
}
