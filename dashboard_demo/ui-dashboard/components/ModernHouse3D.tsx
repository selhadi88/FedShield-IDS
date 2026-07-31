'use client';

import React, { useRef, useMemo, useState, useEffect } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Html, Line, Environment, ContactShadows, OrbitControls } from '@react-three/drei';
import { EffectComposer, Bloom, Vignette } from '@react-three/postprocessing';
import * as THREE from 'three';

interface SceneProps {
    isAttack: boolean;
    targetDevice: string | null;
    isAlertActive?: boolean;
    packetsPerSecond?: number;
    devices?: Record<string, { is_isolated: boolean; status: string; pps?: number }>;
    flPhase?: string | null;
    flTarget?: string | null;
    theme?: 'light' | 'dark';
    ldpState?: { node: string, state: string } | null;
}

const CITY_SIZE = 60;
const BUILDING_COUNT = 30;
const CAR_COUNT = 15; // Reduced for less clutter

const HOME_ALPHA_DEVICES = [
    { id: 'security_camera', label: 'Camera', position: [-1.2, -0.5, -1.2] as [number, number, number] },
    { id: 'smart_lock', label: 'Smart Lock', position: [1.2, -0.5, -1.2] as [number, number, number] },
    { id: 'fridge', label: 'Fridge', position: [-1.2, -0.5, 1.2] as [number, number, number] },
    { id: 'smart_tv', label: 'Smart TV', position: [1.2, -0.5, 1.2] as [number, number, number] },
];

const HOME_BETA_DEVICES = [
    { id: 'smart_thermostat', label: 'Thermostat', position: [-1.2, -0.5, -1.2] as [number, number, number] },
    { id: 'smart_blinds', label: 'Blinds', position: [1.2, -0.5, -1.2] as [number, number, number] },
    { id: 'energy_meter', label: 'Energy Meter', position: [-1.2, -0.5, 1.2] as [number, number, number] },
];

type CameraMode = 'city' | 'top' | 'iso' | 'dive';

interface DeviceData {
    label: string;
    worldPos: THREE.Vector3;
    homeName: string;
}

function CameraRig({ mode, diveTarget }: { mode: CameraMode; diveTarget: THREE.Vector3 | null }) {
    useFrame((state, delta) => {
        let targetPos = new THREE.Vector3(20, 15, 20); // Default City
        let targetLookAt = new THREE.Vector3(0, 0, 0);

        if (mode === 'dive' && diveTarget) {
            // Position camera slightly offset from the target device
            targetPos.copy(diveTarget).add(new THREE.Vector3(0, 1.5, 2.5));
            targetLookAt.copy(diveTarget);
        } else if (mode === 'top') {
            targetPos.set(0, 25, 0);
            targetLookAt.set(0, 0, 0);
        } else if (mode === 'iso') {
            targetPos.set(15, 15, 15);
            targetLookAt.set(0, 0, 0);
        }

        if (mode !== 'city') {
            state.camera.position.lerp(targetPos, delta * 4);
            if (state.controls) {
                // @ts-ignore
                state.controls.target.copy(targetLookAt);
            }
        }
    });
    return null;
}

function Traffic() {
    const cars = useRef<THREE.InstancedMesh>(null);
    const dummy = useMemo(() => new THREE.Object3D(), []);

    const data = useMemo(() => {
        return Array.from({ length: CAR_COUNT }, () => {
            const isX = Math.random() > 0.5;
            // Snapped to specific lanes to avoid hitting homes
            const lane = Math.random() > 0.5 ? 6 : -6;
            return {
                x: isX ? (Math.random() - 0.5) * CITY_SIZE : lane,
                z: isX ? lane : (Math.random() - 0.5) * CITY_SIZE,
                speed: 2 + Math.random() * 4, // Slower
                axis: isX ? 'x' : 'z',
                dir: Math.random() > 0.5 ? 1 : -1,
                color: new THREE.Color(Math.random() > 0.5 ? '#eab308' : '#ef4444')
            };
        });
    }, []);

    useEffect(() => {
        if (cars.current) {
            data.forEach((car, i) => {
                cars.current!.setColorAt(i, car.color);
            });
            cars.current.instanceColor!.needsUpdate = true;
        }
    }, [data]);

    useFrame((state, delta) => {
        if (!cars.current) return;
        data.forEach((car, i) => {
            if (car.axis === 'x') {
                car.x += car.speed * car.dir * delta;
                if (car.x > CITY_SIZE / 2) car.x = -CITY_SIZE / 2;
                if (car.x < -CITY_SIZE / 2) car.x = CITY_SIZE / 2;
            } else {
                car.z += car.speed * car.dir * delta;
                if (car.z > CITY_SIZE / 2) car.z = -CITY_SIZE / 2;
                if (car.z < -CITY_SIZE / 2) car.z = CITY_SIZE / 2;
            }
            dummy.position.set(car.x, 0.1, car.z);
            dummy.scale.set(car.axis === 'x' ? 0.6 : 0.2, 0.1, car.axis === 'z' ? 0.6 : 0.2);
            dummy.updateMatrix();
            cars.current!.setMatrixAt(i, dummy.matrix);
        });
        cars.current.instanceMatrix.needsUpdate = true;
    });

    return (
        <instancedMesh ref={cars} args={[undefined, undefined, CAR_COUNT]}>
            <boxGeometry />
            <meshBasicMaterial toneMapped={false} />
        </instancedMesh>
    );
}

function CityEnvironment({ theme }: { theme?: 'light' | 'dark' }) {
    const buildings = useMemo(() => {
        const b = [];
        for (let i = 0; i < BUILDING_COUNT; i++) {
            const x = (Math.random() - 0.5) * CITY_SIZE;
            const z = (Math.random() - 0.5) * CITY_SIZE;
            // Keep center corridor clear for homes and server
            if (Math.abs(z) < 12) continue;

            const width = 1.5 + Math.random() * 3;
            const depth = 1.5 + Math.random() * 3;
            const height = 2 + Math.random() * 6;

            const matrix = new THREE.Matrix4();
            matrix.setPosition(x, height / 2, z);
            matrix.scale(new THREE.Vector3(width, height, depth));
            b.push(matrix);
        }
        return b;
    }, []);

    const instancedMeshRef = useRef<THREE.InstancedMesh>(null);

    useEffect(() => {
        if (instancedMeshRef.current) {
            buildings.forEach((matrix, i) => {
                instancedMeshRef.current!.setMatrixAt(i, matrix);
            });
            instancedMeshRef.current.instanceMatrix.needsUpdate = true;
        }
    }, [buildings]);

    return (
        <group>
            <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
                <planeGeometry args={[CITY_SIZE, CITY_SIZE]} />
                <meshStandardMaterial color={theme === 'light' ? "#fafafa" : "#05050a"} roughness={0.9} />
            </mesh>

            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.01, 0]} receiveShadow>
                <planeGeometry args={[CITY_SIZE, CITY_SIZE]} />
                <meshStandardMaterial color={theme === 'light' ? "#f4f4f5" : "#0a0a0c"} roughness={0.95} metalness={0.1} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
                <planeGeometry args={[0.2, CITY_SIZE]} />
                <meshBasicMaterial color={theme === 'light' ? "#e4e4e7" : "#1f2937"} transparent opacity={0.6} />
            </mesh>
            <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]}>
                <planeGeometry args={[CITY_SIZE, 0.2]} />
                <meshBasicMaterial color={theme === 'light' ? "#e4e4e7" : "#1f2937"} transparent opacity={0.6} />
            </mesh>

            <instancedMesh ref={instancedMeshRef} args={[undefined, undefined, BUILDING_COUNT]} castShadow receiveShadow>
                <boxGeometry />
                <meshStandardMaterial color={theme === 'light' ? "#e4e4e7" : "#0f172a"} roughness={0.7} metalness={0.4} />
            </instancedMesh>

            <Traffic />
        </group>
    );
}

function NetworkParticles({ start, end, packetsPerSecond = 0, isAlertActive = false, theme = 'dark' }: { start: THREE.Vector3, end: THREE.Vector3, packetsPerSecond?: number, isAlertActive?: boolean, theme?: 'light' | 'dark' }) {
    const pointsRef = useRef<THREE.Points>(null);
    const count = 12;

    const pArray = useMemo(() => new Float32Array(count * 3), [count]);
    const offsets = useRef(Array.from({ length: count }, (_, i) => i / count));

    useFrame((state, delta) => {
        if (!pointsRef.current) return;

        let speed = 0.2 + (packetsPerSecond / 10000);
        if (isAlertActive) speed = 3.5;

        for (let i = 0; i < count; i++) {
            offsets.current[i] += speed * delta;
            if (offsets.current[i] > 1) offsets.current[i] -= 1;

            const t = offsets.current[i];
            const currentPos = new THREE.Vector3().lerpVectors(start, end, t);

            pArray[i * 3] = currentPos.x;
            pArray[i * 3 + 1] = currentPos.y;
            pArray[i * 3 + 2] = currentPos.z;
        }

        pointsRef.current.geometry.attributes.position.needsUpdate = true;
    });

    return (
        <points ref={pointsRef}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    args={[pArray, 3]}
                />
            </bufferGeometry>
            <pointsMaterial size={isAlertActive ? 0.3 : 0.1} color={isAlertActive ? "#ef4444" : (theme === 'light' ? "#a1a1aa" : "#ffffff")} transparent opacity={0.9} toneMapped={false} />
        </points>
    );
}

function AlertRing() {
    const ringRef = useRef<THREE.Mesh>(null);
    useFrame((state) => {
        if (ringRef.current) {
            const s = 1 + Math.sin(state.clock.elapsedTime * 6) * 0.15;
            ringRef.current.scale.set(s, s, s);
            (ringRef.current.material as THREE.MeshBasicMaterial).opacity = 0.4 + Math.sin(state.clock.elapsedTime * 6) * 0.2;
        }
    });
    return (
        <mesh ref={ringRef} position={[0, -0.2, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <ringGeometry args={[0.5, 0.6, 32]} />
            <meshBasicMaterial color="#e11d48" transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
    );
}

function SmartHome({
    homeName,
    offset,
    devicesDef,
    flPhase,
    flTarget,
    mode,
    devicesState,
    theme,
    ldpState,
    onSelectDevice
}: {
    homeName: string;
    offset: [number, number, number];
    devicesDef: { id: string; label: string; position: [number, number, number] }[];
    mode: CameraMode;
    devicesState?: Record<string, { is_isolated: boolean; status: string; pps?: number }>;
    flPhase?: string | null;
    flTarget?: string | null;
    theme?: 'light' | 'dark';
    ldpState?: { node: string, state: string } | null;
    onSelectDevice: (data: DeviceData) => void;
}) {
    const houseCenter = new THREE.Vector3(0, 0.5, 0);
    const houseMatRef = useRef<THREE.MeshStandardMaterial>(null);
    const houseOpRef = useRef(1.0);
    const shieldRef = useRef<THREE.Mesh>(null);

    const isLdpPerturbing = ldpState?.state === 'PERTURBING_WEIGHTS' && devicesDef.some(d => d.id === ldpState?.node);

    useFrame((state, delta) => {
        if (houseMatRef.current) {
            const targetOpacity = mode === 'dive' ? 0.15 : 1.0;
            houseOpRef.current += (targetOpacity - houseOpRef.current) * delta * 5;
            houseMatRef.current.opacity = houseOpRef.current;
        }
        if (shieldRef.current) {
            shieldRef.current.rotation.y += delta * 10;
            shieldRef.current.rotation.x += delta * 8;
        }
    });

    const isHomeAlertActive = useMemo(() => {
        return devicesDef.some(dev => devicesState?.[dev.id]?.status === 'Critical' || devicesState?.[dev.id]?.status === 'ATTACKED');
    }, [devicesDef, devicesState]);

    return (
        <group position={offset}>
            <mesh position={[0, 1.25, 0]} castShadow receiveShadow>
                <boxGeometry args={[3.5, 2.5, 3.5]} />
                <meshStandardMaterial
                    ref={houseMatRef}
                    color={isLdpPerturbing ? "#a855f7" : (isHomeAlertActive ? "#4c0519" : "#1e3a8a")}
                    transparent
                    roughness={0.2}
                    metalness={0.2}
                />
            </mesh>

            {isLdpPerturbing && (
                <mesh ref={shieldRef} position={[0, 1.25, 0]}>
                    <sphereGeometry args={[2.5, 12, 12]} />
                    <meshBasicMaterial color="#a855f7" wireframe transparent opacity={0.6} />
                    <Html position={[0, 3.0, 0]} center className="pointer-events-none z-50">
                        <div className="bg-[#a855f7]/20 border border-[#a855f7] text-[#e9d5ff] px-2 py-1 rounded shadow-[0_0_15px_rgba(168,85,247,0.8)] font-bold uppercase tracking-widest text-[8px] whitespace-nowrap animate-pulse">
                            SECURE_LDP_MUTE_ENGAGED (ε=1.0)
                        </div>
                    </Html>
                </mesh>
            )}

            {mode !== 'dive' && !isLdpPerturbing && (
                <Html position={[0, 3.5, 0]} center zIndexRange={[100, 0]} className="pointer-events-none">
                    <div className={`bg-blue-950/80 border text-blue-200 px-4 py-1 rounded-full shadow-[0_0_15px_rgba(30,58,138,0.6)] font-bold uppercase tracking-widest text-[9px]
                        ${isHomeAlertActive ? 'border-rose-500 text-rose-300 shadow-[0_0_15px_rgba(225,29,72,0.6)]' : 'border-blue-500'}`}>
                        {homeName} Node
                    </div>
                </Html>
            )}

            <group visible={houseOpRef.current < 0.9}>
                <mesh position={[0, 0.5, 0]}>
                    <cylinderGeometry args={[0.2, 0.2, 0.1, 16]} />
                    <meshStandardMaterial color="#06b6d4" emissive="#06b6d4" emissiveIntensity={0.5} />
                </mesh>

                {devicesDef.map((dev) => {
                    const devState = devicesState?.[dev.id];
                    const isTargetAlert = devState?.status === 'Critical' || devState?.status === 'ATTACKED';
                    const isIsolated = devState?.is_isolated;
                    const pps = devState?.pps || 0;
                    const posVector = new THREE.Vector3(...dev.position);

                    const isUploadingThis = flPhase === 'PHASE_WEIGHT_UPLOADING' && flTarget === dev.id;
                    const isBroadcast = flPhase === 'PHASE_GLOBAL_BROADCAST';

                    return (
                        <group key={dev.id}>
                            <Line
                                points={[posVector, houseCenter]}
                                color={isIsolated ? "#444" : isTargetAlert ? "#e11d48" : (theme === 'light' ? "#d4d4d8" : "#0ea5e9")}
                                lineWidth={isTargetAlert ? 2.5 : 1.5}
                                transparent
                                opacity={0.6}
                                dashed={isIsolated}
                                dashScale={2}
                                dashSize={0.5}
                                gapSize={0.2}
                            />
                            {!isIsolated && !isUploadingThis && !isBroadcast && (
                                <NetworkParticles
                                    start={houseCenter}
                                    end={posVector}
                                    packetsPerSecond={pps}
                                    isAlertActive={isTargetAlert}
                                    theme={theme}
                                />
                            )}
                            
                            {isUploadingThis && (
                                <FLWeightParticles start={posVector} end={houseCenter} color="#eab308" count={10} speed={4} />
                            )}
                            {isBroadcast && (
                                <FLWeightParticles start={houseCenter} end={posVector} color="#8b5cf6" count={15} speed={6} />
                            )}
                            <mesh
                                name={dev.id}
                                position={dev.position}
                                castShadow
                                onClick={(e) => {
                                    e.stopPropagation();
                                    const worldPos = new THREE.Vector3();
                                    e.object.getWorldPosition(worldPos);
                                    onSelectDevice({ label: dev.label, worldPos, homeName });
                                }}
                                onPointerOver={() => { document.body.style.cursor = 'pointer'; }}
                                onPointerOut={() => { document.body.style.cursor = 'auto'; }}
                            >
                                <boxGeometry args={[0.4, 0.6, 0.4]} />
                                <meshStandardMaterial color={isIsolated ? "#111" : isTargetAlert ? "#be123c" : "#1e293b"} roughness={0.5} />
                                {isTargetAlert && !isIsolated && <AlertRing />}
                            </mesh>

                            <Html position={[dev.position[0], dev.position[1] + 0.6, dev.position[2]]} center className="pointer-events-none">
                                <div className={`whitespace-nowrap px-2 py-0.5 rounded border text-[7px] font-bold shadow-xl transition-colors tracking-widest uppercase
                                    ${isIsolated ? 'bg-gray-900 border-gray-700 text-gray-500' : isTargetAlert ? 'bg-rose-950/90 border-rose-500 text-rose-300' : 'bg-black/80 border-gray-700 text-cyan-400'}`}>
                                    {isIsolated ? '[OFFLINE]' : dev.label}
                                </div>
                            </Html>
                        </group>
                    );
                })}
            </group>
        </group>
    );
}

function FLWeightParticles({ start, end, color = "#eab308", count = 20, speed = 4 }: { start: THREE.Vector3, end: THREE.Vector3, color?: string, count?: number, speed?: number }) {
    const pointsRef = useRef<THREE.Points>(null);

    const pArray = useMemo(() => new Float32Array(count * 3), [count]);
    const offsets = useRef(Array.from({ length: count }, (_, i) => i / count));

    useFrame((state, delta) => {
        if (!pointsRef.current) return;

        for (let i = 0; i < count; i++) {
            offsets.current[i] += speed * delta;
            if (offsets.current[i] > 1) offsets.current[i] -= 1;

            const t = offsets.current[i];
            const currentPos = new THREE.Vector3().lerpVectors(start, end, t);

            pArray[i * 3] = currentPos.x;
            pArray[i * 3 + 1] = currentPos.y;
            pArray[i * 3 + 2] = currentPos.z;
        }

        pointsRef.current.geometry.attributes.position.needsUpdate = true;
    });

    return (
        <points ref={pointsRef}>
            <bufferGeometry>
                <bufferAttribute
                    attach="attributes-position"
                    args={[pArray, 3]}
                />
            </bufferGeometry>
            <pointsMaterial size={0.4} color={color} transparent opacity={0.9} toneMapped={false} />
        </points>
    );
}

function FederatedServer({ isAlertActive, flPhase, flTarget, theme, ldpState }: { isAlertActive?: boolean; flPhase?: string | null; flTarget?: string | null; theme?: 'light' | 'dark'; ldpState?: { node: string, state: string } | null; }) {
    const serverPos = new THREE.Vector3(0, 5, -5);
    const alphaPos = new THREE.Vector3(-8, 0.5, 0);
    const betaPos = new THREE.Vector3(8, 0.5, 0);

    const serverRef = useRef<THREE.Mesh>(null);
    const materialRef = useRef<THREE.MeshStandardMaterial>(null);

    useFrame((state, delta) => {
        if (serverRef.current && materialRef.current) {
            if (flPhase === 'PHASE_GLOBAL_AGGREGATION' || ldpState?.state === 'DISPATCHING_ENCRYPTED_PAYLOAD') {
                const s = 1 + Math.sin(state.clock.elapsedTime * 10) * 0.1;
                serverRef.current.scale.set(s, s, s);
                materialRef.current.emissiveIntensity = 0.5 + Math.sin(state.clock.elapsedTime * 15) * 0.5;
                materialRef.current.emissive.setHex(0x8b5cf6); // purple
            } else {
                serverRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), delta * 5);
                materialRef.current.emissiveIntensity += (0.2 - materialRef.current.emissiveIntensity) * delta * 5;
                materialRef.current.emissive.setHex(0x0284c7); // blue
            }
        }
    });

    const isUploadingAlpha = (flPhase === 'PHASE_WEIGHT_UPLOADING' || ldpState?.state === 'DISPATCHING_ENCRYPTED_PAYLOAD') && HOME_ALPHA_DEVICES.some(d => d.id === (flTarget || ldpState?.node));
    const isUploadingBeta = (flPhase === 'PHASE_WEIGHT_UPLOADING' || ldpState?.state === 'DISPATCHING_ENCRYPTED_PAYLOAD') && HOME_BETA_DEVICES.some(d => d.id === (flTarget || ldpState?.node));
    const isBroadcast = flPhase === 'PHASE_GLOBAL_BROADCAST';

    return (
        <group>
            {/* Server Mesh */}
            <mesh position={serverPos} castShadow ref={serverRef}>
                <boxGeometry args={[1.5, 2.5, 1.5]} />
                <meshStandardMaterial ref={materialRef} color="#111827" metalness={0.8} roughness={0.2} emissive="#0284c7" emissiveIntensity={0.2} />
            </mesh>
            <Html position={[0, 7, -5]} center className="pointer-events-none">
                <div className="bg-cyan-950/90 border border-cyan-500 text-cyan-300 px-3 py-1 rounded shadow-[0_0_20px_rgba(6,182,212,0.5)] font-bold uppercase tracking-widest text-[8px]">
                    FEDERATED_AGGREGATOR
                </div>
            </Html>

            {/* Main Trunk Lines */}
            <Line
                points={[serverPos, alphaPos]}
                color={isAlertActive ? "#ef4444" : (theme === 'light' ? "#d4d4d8" : "#38bdf8")}
                lineWidth={3}
                transparent
                opacity={0.8}
            />
            <Line
                points={[serverPos, betaPos]}
                color={theme === 'light' ? "#d4d4d8" : "#38bdf8"}
                lineWidth={3}
                transparent
                opacity={0.8}
            />

            {/* Trunk Particles */}
            {isUploadingAlpha && <FLWeightParticles start={alphaPos} end={serverPos} color="#eab308" count={20} speed={4} />}
            {isUploadingBeta && <FLWeightParticles start={betaPos} end={serverPos} color="#eab308" count={20} speed={4} />}
            
            {isBroadcast && (
                <>
                    <FLWeightParticles start={serverPos} end={alphaPos} color="#8b5cf6" count={30} speed={6} />
                    <FLWeightParticles start={serverPos} end={betaPos} color="#8b5cf6" count={30} speed={6} />
                </>
            )}

            {!isUploadingAlpha && !isBroadcast && <NetworkParticles start={serverPos} end={alphaPos} packetsPerSecond={5000} isAlertActive={isAlertActive} theme={theme} />}
            {!isUploadingBeta && !isBroadcast && <NetworkParticles start={serverPos} end={betaPos} packetsPerSecond={2000} isAlertActive={false} theme={theme} />}
        </group>
    );
}

function DigitalTwinScene({
    isAttack,
    targetDevice,
    isAlertActive,
    packetsPerSecond,
    mode,
    setMode,
    devices,
    flPhase,
    flTarget,
    diveTarget,
    selectedDevice,
    setSelectedDevice,
    theme,
    ldpState
}: SceneProps & {
    mode: CameraMode;
    setMode: (v: CameraMode) => void;
    diveTarget: THREE.Vector3 | null;
    selectedDevice: DeviceData | null;
    setSelectedDevice: (d: DeviceData | null) => void;
}) {
    return (
        <group>
            <Environment preset={theme === 'light' ? "city" : "night"} />
            <ambientLight intensity={theme === 'light' ? 0.7 : 0.4} color="#06b6d4" />
            <directionalLight
                position={[20, 25, 10]}
                intensity={theme === 'light' ? 0.5 : 2.8}
                color={isAttack ? "#ef4444" : "#ffffff"}
                castShadow
                shadow-mapSize={[2048, 2048]}
                shadow-bias={-0.0001}
            />
            <pointLight position={[-10, 10, -10]} intensity={theme === 'light' ? 3.0 : 2.2} color="#38bdf8" />
            <ContactShadows opacity={theme === 'light' ? 0.3 : 0.6} scale={40} blur={2} far={4.5} color="#000000" />

            <CityEnvironment theme={theme} />
            <FederatedServer isAlertActive={isAlertActive} flPhase={flPhase} flTarget={flTarget} theme={theme} ldpState={ldpState} />

            {/* Smart Home Alpha */}
            <SmartHome
                homeName="Alpha"
                offset={[-8, 0, 0]}
                devicesDef={HOME_ALPHA_DEVICES}
                mode={mode}
                devicesState={devices}
                flPhase={flPhase}
                flTarget={flTarget}
                theme={theme}
                ldpState={ldpState}
                onSelectDevice={(d) => {
                    setSelectedDevice(d);
                    setMode('dive');
                }}
            />

            {/* Smart Home Beta */}
            <SmartHome
                homeName="Beta"
                offset={[8, 0, 0]}
                devicesDef={HOME_BETA_DEVICES}
                mode={mode}
                devicesState={devices}
                flPhase={flPhase}
                flTarget={flTarget}
                theme={theme}
                ldpState={ldpState}
                onSelectDevice={(d) => {
                    setSelectedDevice(d);
                    setMode('dive');
                }}
            />

            {/* Raycasted UI Telemetry Overlay */}
            {mode === 'dive' && selectedDevice && (
                <Html position={[selectedDevice.worldPos.x, selectedDevice.worldPos.y + 1.2, selectedDevice.worldPos.z]} center className="pointer-events-none z-50">
                    <div className="bg-black/90 border border-cyan-500/50 p-4 w-48 shadow-[0_0_30px_rgba(6,182,212,0.2)] backdrop-blur-md rounded-lg">
                        <div className="text-cyan-400 text-[9px] font-black tracking-widest border-b border-cyan-900/50 pb-1 mb-2">
                            TELEMETRY: {selectedDevice.label.toUpperCase()}
                        </div>
                        <div className="flex justify-between text-[8px] mb-1 font-mono">
                            <span className="text-gray-500">NODE_IP</span>
                            <span className="text-cyan-200">192.168.{selectedDevice.homeName === 'Alpha' ? '1' : '2'}.{Math.floor(Math.random() * 50 + 10)}</span>
                        </div>
                        <div className="flex justify-between text-[8px] mb-1 font-mono">
                            <span className="text-gray-500">PKT_RATE</span>
                            <span className={isAlertActive && selectedDevice.homeName === 'Alpha' ? 'text-red-500 font-bold' : 'text-cyan-300'}>
                                {selectedDevice.homeName === 'Alpha' ? packetsPerSecond : Math.floor(Math.random() * 100)} p/s
                            </span>
                        </div>
                        <div className="flex justify-between text-[8px] font-mono mt-2 pt-1 border-t border-white/10">
                            <span className="text-gray-500">SHAP_ANOMALY</span>
                            <span className={isAlertActive && selectedDevice.homeName === 'Alpha' ? 'text-red-500 font-bold' : 'text-emerald-400'}>
                                {isAlertActive && selectedDevice.homeName === 'Alpha' ? '0.94' : '0.02'}
                            </span>
                        </div>
                    </div>
                </Html>
            )}
        </group>
    );
}

const ModernHouse3D = React.forwardRef<{ setCameraMode: (mode: CameraMode) => void }, SceneProps>(
    ({ isAttack, targetDevice, isAlertActive, packetsPerSecond, devices, flPhase, flTarget, theme = 'dark', ldpState }, ref) => {
        const [mode, setMode] = useState<CameraMode>('city');
        const [selectedDevice, setSelectedDevice] = useState<DeviceData | null>(null);

        React.useImperativeHandle(ref, () => ({
            setCameraMode: (newMode: CameraMode) => {
                setMode(newMode);
                if (newMode !== 'dive') {
                    setSelectedDevice(null);
                }
            }
        }));

        return (
            <div className="w-full h-full relative outline-none ring-0 focus:outline-none">
                {mode !== 'city' && (
                    <button
                        onClick={() => {
                            setMode('city');
                            setSelectedDevice(null);
                        }}
                        className="absolute top-6 left-1/2 -translate-x-1/2 z-50 bg-black/80 border border-cyan-500/50 text-cyan-400 px-6 py-2.5 font-mono text-[10px] uppercase font-bold tracking-[0.2em] hover:bg-cyan-900/50 hover:text-white shadow-[0_0_20px_rgba(6,182,212,0.3)] transition-all rounded-full flex items-center gap-2 cursor-pointer"
                    >
                        <span className="text-[12px]">↶</span> Return to City View
                    </button>
                )}

                <Canvas
                    shadows
                    dpr={[1, 2]}
                    gl={{ antialias: true, powerPreference: 'high-performance' }}
                    camera={{ position: [20, 15, 20], fov: 35, near: 0.1, far: 1000 }}
                    className="w-full h-full"
                >
                    <color attach="background" args={[theme === 'light' ? '#f4f4f5' : '#0a0a0c']} />
                    <fogExp2 attach="fog" args={[isAttack ? '#450a0a' : (theme === 'light' ? '#f4f4f5' : '#0a0a0c'), theme === 'light' ? 0.015 : 0.025]} />

                    <CameraRig mode={mode} diveTarget={selectedDevice?.worldPos || null} />

                    <OrbitControls
                        makeDefault
                        enableDamping
                        dampingFactor={0.05}
                        maxPolarAngle={Math.PI / 2.2}
                        minDistance={4}
                        maxDistance={80}
                        autoRotate={mode === 'city' && !isAttack}
                        autoRotateSpeed={0.5}
                    />

                    <DigitalTwinScene
                        isAttack={isAttack}
                        targetDevice={targetDevice}
                        isAlertActive={isAlertActive}
                        packetsPerSecond={packetsPerSecond}
                        mode={mode}
                        setMode={setMode}
                        devices={devices}
                        flPhase={flPhase}
                        flTarget={flTarget}
                        selectedDevice={selectedDevice}
                        setSelectedDevice={setSelectedDevice}
                        diveTarget={selectedDevice?.worldPos || null}
                        theme={theme}
                        ldpState={ldpState}
                    />

                    <EffectComposer enableNormalPass>
                        <Bloom intensity={1.5} luminanceThreshold={1} mipmapBlur />
                        <Vignette eskil={false} offset={0.1} darkness={1.1} />
                    </EffectComposer>
                </Canvas>
            </div>
        );
    }
);

const areEqual = (prevProps: SceneProps, nextProps: SceneProps) => {
    return (
        prevProps.isAttack === nextProps.isAttack &&
        prevProps.targetDevice === nextProps.targetDevice &&
        prevProps.isAlertActive === nextProps.isAlertActive &&
        prevProps.packetsPerSecond === nextProps.packetsPerSecond &&
        prevProps.flPhase === nextProps.flPhase &&
        prevProps.flTarget === nextProps.flTarget &&
        prevProps.theme === nextProps.theme &&
        JSON.stringify(prevProps.devices) === JSON.stringify(nextProps.devices)
    );
};

export default React.memo(ModernHouse3D, areEqual);
