// CS405 · Lab 1 — your first triangle in WebGPU (starter)
// Work through the TODOs in order. After each one, check the matching
// checkpoint on the lab slides. The reference solution is in ../lab1-solution/.


// ---------------------------------------------------------------------------
// TODO 1 — get a device and configure the canvas
//   a) check navigator.gpu exists, throw a clear error if not
//   b) const adapter = await navigator.gpu.requestAdapter()
//   c) const device  = await adapter.requestDevice()
//   d) const ctx     = canvas.getContext('webgpu')
//   e) const format  = navigator.gpu.getPreferredCanvasFormat()
//   f) ctx.configure({ device, format, alphaMode: 'opaque' })
//   g) console.log('WebGPU ready:', format)
// ---------------------------------------------------------------------------

const canvas = document.querySelector('canvas');
if (!navigator.gpu) throw new Error('WebGPU not supported');

const adapter = await navigator.gpu.requestAdapter();
if (!adapter) throw new Error('Failed to get GPU adapter');

const device = await adapter.requestDevice();
const ctx = canvas.getContext('webgpu');
const format = navigator.gpu.getPreferredCanvasFormat();
ctx.configure({ device, format, alphaMode: 'opaque' });

console.log('WebGPU ready:', format);

// ---------------------------------------------------------------------------
// TODO 2 — a shader module and a render pipeline
//   The vertex shader returns clip-space positions for vertex_index 0, 1, 2.
//   The fragment shader returns a solid colour.
//   Then: device.createRenderPipeline({ layout: 'auto', vertex, fragment })
// ---------------------------------------------------------------------------

const shaderModule = device.createShaderModule({
  label: 'triangle shaders',
  code: `
    // TODO 4 & 5: CPU'dan GPU'ya uniform verileri (zaman, en-boy oranı, fare konumu)
    struct Uniforms {
      time: f32,
      aspect: f32,
      mouse: vec2f,
    };
    @group(0) @binding(0) var<uniform> uniforms: Uniforms;

    // TODO 3: Vertex shader'dan birden fazla değer (pozisyon + renk) döndürmek için struct
    struct VertexOutput {
      @builtin(position) position: vec4f,
      @location(0) colour: vec4f,
    };

    @vertex
    fn vs_main(@builtin(vertex_index) vi: u32) -> VertexOutput {
      // TODO 5: İki üçgenden oluşan bir kare (6 köşe)
      var pos = array<vec2f, 6>(
        vec2f(-0.25, -0.25),
        vec2f( 0.25, -0.25),
        vec2f( 0.25,  0.25),

        vec2f(-0.25, -0.25),
        vec2f( 0.25,  0.25),
        vec2f(-0.25,  0.25)
      );

      // Her köşe için renkler (TODO 3 & 5)
      var col = array<vec4f, 6>(
        vec4f(1.0, 0.2, 0.2, 1.0),
        vec4f(0.2, 1.0, 0.2, 1.0),
        vec4f(0.2, 0.4, 1.0, 1.0),

        vec4f(1.0, 0.2, 0.2, 1.0),
        vec4f(0.2, 0.4, 1.0, 1.0),
        vec4f(1.0, 1.0, 0.2, 1.0)
      );

      let p = pos[vi];

      // TODO 4: Zamanla dönme hesabı (2D Rotasyon)
      let angle = uniforms.time;
      let cos_a = cos(angle);
      let sin_a = sin(angle);
      let rotated = vec2f(
        p.x * cos_a - p.y * sin_a,
        p.x * sin_a + p.y * cos_a
      );

      // TODO 5: En-boy oranı (aspect ratio) düzeltmesi:
      let corrected = vec2f(rotated.x / uniforms.aspect, rotated.y);

      // TODO 5: Farenin konumunu ekleyerek şeklin fareyi takip etmesi:
      let final_pos = corrected + uniforms.mouse;

      var out: VertexOutput;
      out.position = vec4f(final_pos, 0.0, 1.0);
      out.colour = col[vi];
      return out;
    }

    @fragment
    fn fs_main(in: VertexOutput) -> @location(0) vec4f {
      // GPU ara piksellerin renklerini otomatik enterpole (harmanlar) eder
      return in.colour;
    }
  `,
});

const pipeline = device.createRenderPipeline({
  layout: 'auto',
  vertex: {
    module: shaderModule,
    entryPoint: 'vs_main',
  },
  fragment: {
    module: shaderModule,
    entryPoint: 'fs_main',
    targets: [{ format }],
  },
});

// ---------------------------------------------------------------------------
// TODO 4 — a uniform buffer with the time, and rotate the triangle
//   size 16 bytes, usage UNIFORM | COPY_DST
//   bind group from pipeline.getBindGroupLayout(0)
//   device.queue.writeBuffer(...) every frame
// ---------------------------------------------------------------------------

const uniformBuffer = device.createBuffer({
  size: 16,
  usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
});

const bindGroup = device.createBindGroup({
  layout: pipeline.getBindGroupLayout(0),
  entries: [{
    binding: 0,
    resource: { buffer: uniformBuffer },
  }],
});

const startTime = performance.now();
const uniformData = new Float32Array(4); // [time, aspect, mouseX, mouseY]

// ---------------------------------------------------------------------------
// TODO 5 — a square (two triangles), correct aspect ratio,
//   and the shape following the mouse.
// ---------------------------------------------------------------------------

let mouseX = 0;
let mouseY = 0;

window.addEventListener('pointermove', (e) => {
  const r = canvas.getBoundingClientRect();
  // Fare koordinatlarını WebGPU clip-space [-1, 1] aralığına dönüştürüyoruz
  mouseX = ((e.clientX - r.left) / r.width) * 2 - 1;
  mouseY = -(((e.clientY - r.top) / r.height) * 2 - 1);
});

function t0() {
  return performance.now();
}

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const r = canvas.getBoundingClientRect();
  canvas.width = Math.round(r.width * dpr);
  canvas.height = Math.round(r.height * dpr);
}
window.addEventListener('resize', resize);
resize();

function frame() {
  // Uniform verilerini GPU'ya gönderiyoruz:
  const aspect = canvas.width / canvas.height;
  uniformData[0] = (performance.now() - startTime) * 0.001; // zaman (saniye)
  uniformData[1] = aspect;                                   // en-boy oranı
  uniformData[2] = mouseX;                                   // fare X konumu
  uniformData[3] = mouseY;                                   // fare Y konumu
  device.queue.writeBuffer(uniformBuffer, 0, uniformData);

  const enc=device.createCommandEncoder();
  const pass=enc.beginRenderPass({
    colorAttachments:[{
      view:ctx.getCurrentTexture().createView(),
      clearValue:{r:0.3,g:0.3,b:0.3,a:1},
      loadOp:'clear',
      storeOp:'store'
    }]
  });
  pass.setPipeline(pipeline);
  pass.setBindGroup(0, bindGroup);
  pass.draw(6); // İki üçgenden oluşan kare için 6 köşe
  pass.end();
  device.queue.submit([enc.finish()]);

  requestAnimationFrame(frame);
}
frame();

