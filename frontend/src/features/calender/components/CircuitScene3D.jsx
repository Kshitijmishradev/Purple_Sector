import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { getCircuitGeometry } from "../circuitGeometry";

const makeMaterial = (color, opacity = 1) =>
  new THREE.MeshBasicMaterial({ color, transparent: opacity < 1, opacity });

const supportsWebGL = () => {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext("webgl") || canvas.getContext("experimental-webgl")),
    );
  } catch {
    return false;
  }
};

const CircuitScene3D = ({ eventName, circuitKey, round, supported }) => {
  const hostRef = useRef(null);
  const [fallback] = useState(() => !supportsWebGL());

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;

    if (fallback) return undefined;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return undefined;
    }

    const geometry = getCircuitGeometry(circuitKey, eventName);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const width = host.clientWidth || 640;
    const height = host.clientHeight || 360;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 100);
    camera.position.set(0, 3.9, 4.8);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    renderer.setSize(width, height);
    renderer.setClearColor(0x080b10, 0);
    renderer.domElement.setAttribute("aria-label", `${eventName || "Venue"} stylized 3D circuit study`);
    renderer.domElement.setAttribute("role", "img");
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.enablePan = false;
    controls.minDistance = 2.8;
    controls.maxDistance = 7;
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.autoRotate = !reducedMotion;
    controls.autoRotateSpeed = 0.45;

    const accent = new THREE.Color(geometry.accent);
    const points = geometry.points.map(([x, y], index) =>
      new THREE.Vector3(x, Math.sin(index * 1.7) * 0.05, y),
    );
    const curve = new THREE.CatmullRomCurve3(points, true, "catmullrom", 0.16);
    const track = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 180, 0.085, 8, true),
      new THREE.MeshStandardMaterial({
        color: accent,
        emissive: accent,
        emissiveIntensity: 0.42,
        roughness: 0.75,
        metalness: 0.1,
      }),
    );
    scene.add(track);

    const inner = new THREE.Mesh(
      new THREE.TubeGeometry(curve, 180, 0.024, 5, true),
      makeMaterial(0xf2f7fc, 0.75),
    );
    inner.position.y = 0.09;
    scene.add(inner);

    const grid = new THREE.GridHelper(5.5, 22, 0x27374a, 0x121b25);
    grid.position.y = -0.16;
    grid.rotation.x = 0;
    scene.add(grid);

    const startMarker = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.035, 0.12),
      makeMaterial(0xffffff),
    );
    const start = curve.getPointAt(0);
    startMarker.position.set(start.x, 0.16, start.z);
    scene.add(startMarker);

    geometry.cornerLabels.forEach((pointIndex) => {
      const point = curve.getPointAt(pointIndex / Math.max(geometry.points.length, 1));
      const marker = new THREE.Mesh(
        new THREE.SphereGeometry(0.045, 8, 8),
        makeMaterial(0xffd024),
      );
      marker.position.set(point.x, 0.15, point.z);
      scene.add(marker);
    });

    const ambient = new THREE.HemisphereLight(0xb14cff, 0x081019, 1.1);
    scene.add(ambient);

    const resize = () => {
      const nextWidth = host.clientWidth || 640;
      const nextHeight = host.clientHeight || 360;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);

    let frame;
    const render = () => {
      controls.update();
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(render);
    };
    render();

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((object) => {
        if (object.geometry) object.geometry.dispose();
        if (object.material) {
          const materials = Array.isArray(object.material) ? object.material : [object.material];
          materials.forEach((material) => material.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [circuitKey, eventName, fallback]);

  if (fallback) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center border border-border bg-[#080b10] p-8 text-center">
        <div>
          <p className="ps-label text-primary">Venue study</p>
          <p className="mt-3 font-headline text-2xl font-bold text-foreground">3D unavailable</p>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            Your browser cannot render WebGL here. The venue remains available as schedule metadata.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="relative h-full min-h-[320px] overflow-hidden border border-border bg-[#080b10]">
      <div ref={hostRef} className="absolute inset-0" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,transparent_30%,rgba(6,8,11,0.72)_100%)]" />
      <div className="pointer-events-none absolute left-5 top-5 max-w-[75%]">
        <p className="ps-label text-primary">Stylized venue study · {supported ? "MVP data available" : "schedule only"}</p>
      </div>
      <div className="pointer-events-none absolute bottom-4 left-5 right-5 flex items-end justify-between gap-4 text-[10px] font-mono uppercase tracking-[0.16em] text-muted-foreground">
        <span>Round {String(round || "--").padStart(2, "0")}</span>
        <span>Drag to orbit · scroll to zoom</span>
      </div>
    </div>
  );
};

export default CircuitScene3D;
