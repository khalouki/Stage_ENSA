"use client";
import { useRef, useEffect } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { ROOM_HALF_W, ROOM_HALF_D, CAM_HEIGHT, MOVE_SPEED } from "./constants";

export function FirstPersonCamera() {
  const { camera, gl } = useThree();
  const keysRef = useRef<Record<string, boolean>>({});
  const isDragging = useRef(false);
  const lastMouseRef = useRef({ x: 0, y: 0 });
  const yaw = useRef(-Math.PI / 2);
  const pitch = useRef(0);

  useEffect(() => {
    camera.position.set(0, CAM_HEIGHT, 9);
    // eslint-disable-next-line react-hooks/immutability
    camera.rotation.order = "YXZ";
  }, [camera]);

  useEffect(() => {
    const kd = (e: KeyboardEvent) => { keysRef.current[e.code] = true; };
    const ku = (e: KeyboardEvent) => { keysRef.current[e.code] = false; };
    window.addEventListener("keydown", kd);
    window.addEventListener("keyup", ku);
    return () => {
      window.removeEventListener("keydown", kd);
      window.removeEventListener("keyup", ku);
    };
  }, []);

  useEffect(() => {
    const canvas = gl.domElement;
    const onDown = (e: MouseEvent) => {
      isDragging.current = true;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
    };
    const onMove = (e: MouseEvent) => {
      if (!isDragging.current) return;
      const dx = e.clientX - lastMouseRef.current.x;
      const dy = e.clientY - lastMouseRef.current.y;
      lastMouseRef.current = { x: e.clientX, y: e.clientY };
      yaw.current -= dx * 0.003;
      pitch.current = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch.current - dy * 0.003));
    };
    const onUp = () => { isDragging.current = false; };
    const onTouch = (e: TouchEvent) => {
      if (e.touches.length === 1) {
        isDragging.current = true;
        lastMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      }
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!isDragging.current || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - lastMouseRef.current.x;
      const dy = e.touches[0].clientY - lastMouseRef.current.y;
      lastMouseRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
      yaw.current -= dx * 0.003;
      pitch.current = Math.max(-Math.PI / 2.2, Math.min(Math.PI / 2.2, pitch.current - dy * 0.003));
    };
    const onTouchEnd = () => { isDragging.current = false; };
    canvas.addEventListener("mousedown", onDown);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    canvas.addEventListener("touchstart", onTouch, { passive: true });
    canvas.addEventListener("touchmove", onTouchMove, { passive: true });
    canvas.addEventListener("touchend", onTouchEnd);
    return () => {
      canvas.removeEventListener("mousedown", onDown);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      canvas.removeEventListener("touchstart", onTouch);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, [gl]);

  useFrame((_, delta) => {
    const k = keysRef.current;
    // eslint-disable-next-line react-hooks/immutability
    camera.rotation.y = yaw.current;
    camera.rotation.x = pitch.current;
    const forward = new THREE.Vector3(-Math.sin(yaw.current), 0, -Math.cos(yaw.current));
    const right = new THREE.Vector3(Math.cos(yaw.current), 0, -Math.sin(yaw.current));
    const speed = MOVE_SPEED * delta;
    const move = new THREE.Vector3();
    if (k["KeyW"] || k["KeyZ"] || k["ArrowUp"])    move.addScaledVector(forward, speed);
    if (k["KeyS"] || k["ArrowDown"])  move.addScaledVector(forward, -speed);
    if (k["KeyA"] || k["KeyQ"] || k["ArrowLeft"])  move.addScaledVector(right, -speed);
    if (k["KeyD"] || k["ArrowRight"]) move.addScaledVector(right, speed);
    camera.position.add(move);
    camera.position.x = Math.max(-ROOM_HALF_W, Math.min(ROOM_HALF_W, camera.position.x));
    camera.position.z = Math.max(-ROOM_HALF_D, Math.min(ROOM_HALF_D, camera.position.z));
    camera.position.y = CAM_HEIGHT;
  });

  return null;
}
