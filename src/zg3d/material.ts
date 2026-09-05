import { MeshLambertMaterial, DataTexture, RGBAFormat, UnsignedByteType, NearestFilter, Color, FrontSide, type WebGLProgramParametersWithUniforms } from 'three';

export const PAL_W = 256;

export interface BuildingUniforms {
  uPal: { value: DataTexture };
  uPalSize: { value: [number, number] };
  uSel: { value: number };
}

/** RGBA8 palette texture with one texel per building (row-major, width PAL_W). */
export function makePalette(n: number): { tex: DataTexture; data: Uint8Array; w: number; h: number } {
  const w = Math.min(PAL_W, Math.max(1, n));
  const h = Math.max(1, Math.ceil(n / w));
  const data = new Uint8Array(w * h * 4);
  const tex = new DataTexture(data, w, h, RGBAFormat, UnsignedByteType);
  tex.magFilter = NearestFilter; tex.minFilter = NearestFilter; tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return { tex, data, w, h };
}

/**
 * Lambert + flat shading + shadows; the per-vertex colour comes from a palette lookup
 * by building id (attribute `_id`), so recolouring a tile = re-uploading a tiny texture.
 */
export function createBuildingMaterial(pal: DataTexture, w: number, h: number): MeshLambertMaterial & { uniformsRef: BuildingUniforms } {
  const mat = new MeshLambertMaterial({ vertexColors: true, flatShading: true, side: FrontSide, color: new Color(0xffffff) }) as MeshLambertMaterial & { uniformsRef: BuildingUniforms };
  const uniforms: BuildingUniforms = { uPal: { value: pal }, uPalSize: { value: [w, h] }, uSel: { value: -1 } };
  mat.uniformsRef = uniforms;
  mat.onBeforeCompile = (shader: WebGLProgramParametersWithUniforms) => {
    Object.assign(shader.uniforms, uniforms);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float _id;\nuniform sampler2D uPal;\nuniform vec2 uPalSize;\nuniform float uSel;`)
      .replace('#include <color_vertex>', `
        {
          float w = uPalSize.x;
          vec2 palUv = vec2((mod(_id, w) + 0.5) / w, (floor(_id / w) + 0.5) / uPalSize.y);
          #include <color_vertex>
          vColor.rgb = texture2D(uPal, palUv).rgb;
          if (abs(_id - uSel) < 0.5) vColor.rgb = mix(vColor.rgb, vec3(0.25, 0.50, 1.0), 0.75);
        }`);
    // roofs slightly brighter than walls: cheap fake AO using the flat normal in the fragment stage
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
        #include <color_fragment>
        {
          vec3 fdx = dFdx(vViewPosition); vec3 fdy = dFdy(vViewPosition);
          vec3 fn = normalize(cross(fdx, fdy));
          float up = clamp(dot(fn, vec3(0.0, 1.0, 0.0)), 0.0, 1.0);
          diffuseColor.rgb *= 0.86 + 0.18 * up;
        }`);
  };
  mat.customProgramCacheKey = () => 'zg3d-building';
  return mat;
}
