import { DirectionalLight, HemisphereLight, Vector3, type Camera } from 'three';

/** NOAA-style solar position (degrees). hourLocal is wall-clock time in the browser's zone. */
export function sunPosition(dayOfYear: number, hourLocal: number, lat: number, lon: number): { azimuth: number; elevation: number } {
  const year = new Date().getFullYear();
  const d = new Date(year, 0, 1, 0, 0, 0);
  d.setDate(dayOfYear);
  d.setHours(Math.floor(hourLocal), Math.round((hourLocal % 1) * 60), 0, 0);
  const tzOffsetH = -d.getTimezoneOffset() / 60;
  const jd = d.getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545) / 36525;
  const L0 = (280.46646 + T * (36000.76983 + 0.0003032 * T)) % 360;
  const M = 357.52911 + T * (35999.05029 - 0.0001537 * T);
  const Mr = (M * Math.PI) / 180;
  const C = (1.914602 - T * (0.004817 + 0.000014 * T)) * Math.sin(Mr) + (0.019993 - 0.000101 * T) * Math.sin(2 * Mr) + 0.000289 * Math.sin(3 * Mr);
  const trueLon = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = trueLon - 0.00569 - 0.00478 * Math.sin((omega * Math.PI) / 180);
  const eps0 = 23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = eps0 + 0.00256 * Math.cos((omega * Math.PI) / 180);
  const epsR = (eps * Math.PI) / 180, lamR = (lambda * Math.PI) / 180;
  const decl = Math.asin(Math.sin(epsR) * Math.sin(lamR));
  const y = Math.tan(epsR / 2) ** 2;
  const L0r = (L0 * Math.PI) / 180;
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);
  const eqTime = 4 * (180 / Math.PI) * (y * Math.sin(2 * L0r) - 2 * e * Math.sin(Mr) + 4 * e * y * Math.sin(Mr) * Math.cos(2 * L0r) - 0.5 * y * y * Math.sin(4 * L0r) - 1.25 * e * e * Math.sin(2 * Mr));
  const minutes = d.getHours() * 60 + d.getMinutes();
  const tst = (minutes + eqTime + 4 * lon - 60 * tzOffsetH + 1440) % 1440;
  const ha = tst / 4 < 0 ? tst / 4 + 180 : tst / 4 - 180;
  const latR = (lat * Math.PI) / 180, haR = (ha * Math.PI) / 180;
  const cosZen = Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(haR);
  const zen = Math.acos(Math.max(-1, Math.min(1, cosZen)));
  const elevation = 90 - (zen * 180) / Math.PI;
  let az = Math.acos(Math.max(-1, Math.min(1, (Math.sin(latR) * Math.cos(zen) - Math.sin(decl)) / (Math.cos(latR) * Math.sin(zen))))) * 180 / Math.PI;
  az = ha > 0 ? (az + 180) % 360 : (540 - az) % 360;
  return { azimuth: az, elevation };
}

export class Sun {
  light = new DirectionalLight(0xfff1d6, 2.2);
  hemi = new HemisphereLight(0x8fb0d8, 0x2a2118, 0.9);
  private target = new Vector3();
  constructor(private lat: number, private lon: number, mapSize: number) {
    this.light.castShadow = true;
    this.light.shadow.mapSize.set(mapSize, mapSize);
    this.light.shadow.bias = -0.0006;
    this.light.shadow.normalBias = 0.6;
    this.light.shadow.camera.near = 50;
    this.light.shadow.camera.far = 12000;
    this.light.shadow.radius = 2;
  }
  setShadows(on: boolean) { this.light.castShadow = on; }
  /** Position the light for (dayOfYear, hour) around `target`, fitting the shadow frustum to `radius`. */
  update(dayOfYear: number, hour: number, target: Vector3, radius: number, _camera?: Camera) {
    const { azimuth, elevation } = sunPosition(dayOfYear, hour, this.lat, this.lon);
    const el = Math.max(elevation, 2) * Math.PI / 180;
    const az = azimuth * Math.PI / 180;
    // azimuth: 0 = north, 90 = east. world: +x east, -z north.
    const dir = new Vector3(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
    this.target.copy(target);
    const dist = radius * 2.5;
    this.light.position.copy(target).addScaledVector(dir, dist);
    this.light.target.position.copy(target);
    this.light.target.updateMatrixWorld();
    const cam = this.light.shadow.camera;
    cam.left = -radius; cam.right = radius; cam.top = radius; cam.bottom = -radius;
    cam.near = dist - radius * 1.5; cam.far = dist + radius * 1.5;
    cam.updateProjectionMatrix();
    // Night / twilight tint
    const night = elevation < 0;
    const dusk = Math.max(0, Math.min(1, (elevation + 4) / 12));
    this.light.intensity = night ? 0.15 : 0.6 + 1.9 * dusk;
    this.light.color.setHSL(0.09 + 0.03 * dusk, 0.75 - 0.5 * dusk, 0.6 + 0.3 * dusk);
    this.hemi.intensity = night ? 0.35 : 0.45 + 0.55 * dusk;
    return { azimuth, elevation };
  }
}
