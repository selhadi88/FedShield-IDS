'use client';

import toast from 'react-hot-toast';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, Tv, Refrigerator, Lock, Server, ShieldAlert, ShieldCheck, Activity, Skull, Zap, Clock, RefreshCw, SlidersHorizontal, ShieldOff, Power, PowerOff, Terminal, AlertTriangle, Moon, Sun } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import ModernHouse3D from '../components/ModernHouse3D';
import { UNIFIED_DEVICES, ATTACK_FAMILIES } from '../lib/constants';

// WebSocket endpoint – can be overridden via NEXT_PUBLIC_WS_URL env var
import { API_URL, WS_URL } from '@/lib/config';

const API_KEY = process.env.NEXT_PUBLIC_API_KEY || 'your_fallback_high_entropy_token_here';

interface DeviceState {
    is_isolated: boolean;
    status: string;
    pps?: number;
    rawProb?: number;
    attack_type?: string;
}

interface XAIData {
    name: string;
    weight: number;
}

interface WSMessage {
    type?: string;
    phase?: string;
    msg?: string;
    status: string;
    confidence?: number;
    current_probability?: number;      // raw per-packet score
    smoothed_probability?: number;     // moving-average score
    detection_threshold?: number;      // server-side threshold
    xai_top_features?: XAIData[];
    p_s: number;
    b_s: number;
    target?: string | null;
    attack_type?: string | null;
    xai_report?: XAIData[];
    devices?: Record<string, DeviceState>;
    // New Overhaul Metrics
    f1_score?: number;
    precision?: number;
    accuracy?: number;
    confusionMatrix?: number[][];
    node?: string;
    state?: string;
}



// ── Shared UI Components ──────────────────────────────────────────────────────

function CircularProgress({ value, label, size = 60 }: { value: number; label: string; size?: number }) {
    const radius = (size - 10) / 2;
    const circumference = radius * 2 * Math.PI;
    const offset = circumference - (value * circumference);
    const isOptimal = value > 0.90;

    return (
        <div className="flex flex-col items-center gap-1">
            <div className="relative" style={{ width: size, height: size }}>
                <svg className="transform -rotate-90 w-full h-full">
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="transparent"
                        className="text-[#e4e4e7] dark:text-gray-800"
                    />
                    <circle
                        cx={size / 2}
                        cy={size / 2}
                        r={radius}
                        stroke="currentColor"
                        strokeWidth="4"
                        fill="transparent"
                        strokeDasharray={circumference}
                        style={{ strokeDashoffset: offset, transition: 'stroke-dashoffset 0.5s ease-in-out' }}
                        className={`${isOptimal ? 'text-green-500 matrix-glow' : 'text-cyan-400'}`}
                    />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center text-[10px] font-bold font-mono">
                    {Math.round(value * 100)}%
                </div>
            </div>
            <span className="text-[8px] uppercase tracking-tighter text-gray-400 font-bold">{label}</span>
        </div>
    );
}

const ConfusionMatrixHeatmap = React.memo(({ matrix }: { matrix?: number[][] }) => {
    if (!matrix || matrix.length === 0) return null;

    // Calculate row support (total samples per true class)
    const rowSupport = matrix.map(row => row.reduce((a, b) => a + b, 0));

    return (
        <div className="flex flex-col mt-4 p-3 bg-[#f4f4f5] dark:bg-black/40 border border-[#e4e4e7] dark:border-white/10 rounded-lg">
            <div className="flex items-center justify-between mb-3">
                <span className="text-[10px] font-bold text-[#09090b] dark:text-cyan-300 uppercase tracking-widest">Confusion Matrix (8x8)</span>
            </div>

            <div className="flex relative">
                {/* Y-axis label */}
                <div className="w-4 flex items-center justify-center -rotate-180" style={{ writingMode: 'vertical-rl' }}>
                    <span className="text-[7px] text-[#52525b] dark:text-gray-500 font-bold uppercase tracking-widest">True Attack Vectors</span>
                </div>

                <div className="flex-1 flex flex-col gap-[2px]">
                    {matrix.map((row, i) => {
                        const total = rowSupport[i] || 1; // prevent div by zero
                        return (
                            <div key={`row-${i}`} className="flex gap-[2px] h-5">
                                {row.map((val, j) => {
                                    const pct = val / total;
                                    const isSignificant = val > 0 && pct >= 0.005; // 0.5% threshold
                                    const isDiagonal = i === j;
                                    const isDdosDosConfusion = (ATTACK_FAMILIES[i] === 'DDOS' && ATTACK_FAMILIES[j] === 'DOS') ||
                                        (ATTACK_FAMILIES[i] === 'DOS' && ATTACK_FAMILIES[j] === 'DDOS');

                                    // Dynamic Styling
                                    let bgClass = 'bg-[#e4e4e7] dark:bg-white/5';
                                    let textClass = 'text-transparent';
                                    let style: React.CSSProperties = { opacity: isSignificant ? 1 : 0.1 };

                                    if (isSignificant) {
                                        textClass = 'text-[#18181b] dark:text-white';
                                        if (isDiagonal) {
                                            // True Positives: mint/sage gradient
                                            const intensity = Math.min(Math.max(pct, 0.2), 1);
                                            bgClass = 'bg-emerald-100 dark:bg-emerald-500';
                                            style = { opacity: intensity };
                                            textClass = intensity > 0.5 ? 'text-[#064e3b] dark:text-emerald-950' : 'text-[#064e3b] dark:text-emerald-100';
                                        } else if (isDdosDosConfusion) {
                                            // Critical Confusions
                                            bgClass = 'bg-rose-100 dark:bg-rose-900/80';
                                            textClass = 'text-[#881337] dark:text-rose-200';
                                        } else {
                                            // Normal errors
                                            bgClass = 'bg-orange-100 dark:bg-orange-500/20';
                                            textClass = 'text-[#7c2d12] dark:text-orange-200';
                                        }
                                    }

                                    return (
                                        <div
                                            key={`cell-${i}-${j}`}
                                            className={`group relative flex-1 rounded-[2px] transition-all duration-300 flex items-center justify-center text-[7px] font-bold ${bgClass} ${textClass}`}
                                            style={style}
                                        >
                                            {isSignificant ? val : ''}

                                            {/* Hover Tooltip */}
                                            {isSignificant && (
                                                <div className="absolute z-50 bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none w-32 bg-[#ffffff] dark:bg-black/95 border border-[#e4e4e7] dark:border-white/20 p-2 rounded shadow-xl left-1/2 -translate-x-1/2 text-center backdrop-blur-sm">
                                                    <span className="block text-[8px] text-[#09090b] dark:text-white font-bold mb-0.5">
                                                        {val.toLocaleString()} {ATTACK_FAMILIES[i]} samples
                                                    </span>
                                                    <span className={`block text-[8px] ${isDiagonal ? 'text-[#166534] dark:text-emerald-400' : 'text-[#9f1239] dark:text-rose-400'}`}>
                                                        {isDiagonal ? 'classified correctly' : `misclassified as ${ATTACK_FAMILIES[j]}`}
                                                    </span>
                                                    <span className="block text-[7px] text-[#52525b] dark:text-gray-400 mt-1 pt-1 border-t border-[#e4e4e7] dark:border-white/10">
                                                        Rate: {(pct * 100).toFixed(1)}%
                                                    </span>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* X-axis label */}
            <div className="flex ml-4 mt-2">
                <div className="flex-1 flex justify-between text-[6px] font-mono text-[#52525b] dark:text-gray-500">
                    {ATTACK_FAMILIES.map(f => (
                        <div key={`col-${f}`} className="w-[12.5%] flex justify-center">
                            <span className="-rotate-45 origin-top-left ml-1">{f.slice(0, 3)}</span>
                        </div>
                    ))}
                </div>
            </div>
            <div className="text-center mt-3 ml-4">
                <span className="text-[7px] text-[#52525b] dark:text-gray-500 font-bold uppercase tracking-widest">Predicted Verdicts</span>
            </div>
        </div>
    );
});
ConfusionMatrixHeatmap.displayName = 'ConfusionMatrixHeatmap';



const DEVICE_METADATA: Record<string, { firmware: string; cve: string; risk: string }> = {
    'security_camera': { firmware: 'v2.1.0 (Outdated)', cve: 'CVE-2023-7112 (RCE via RTSP Stream)', risk: 'CRITICAL' },
    'smart_tv': { firmware: 'v4.4.2 (Outdated)', cve: 'CVE-2024-3273 (Command Injection)', risk: 'HIGH' },
    'fridge': { firmware: 'v1.0.8 (Current)', cve: 'None Detected (Baseline Secure)', risk: 'LOW' },
    'smart_lock': { firmware: 'v3.1.1 (Patch Pending)', cve: 'CVE-2023-4561 (Replay Attack Vulnerability)', risk: 'HIGH' },
    'smart_thermostat': { firmware: 'v2.4.1 (Current)', cve: 'None Detected', risk: 'LOW' },
    'smart_blinds': { firmware: 'v1.1.0 (Current)', cve: 'None Detected', risk: 'LOW' },
    'energy_meter': { firmware: 'v5.0.0 (Current)', cve: 'None Detected', risk: 'LOW' }
};

export default function Home() {
    // Core telemetry
    const [packetsPerSecond, setPacketsPerSecond] = useState<number>(0);
    const [bytesPerSecond, setBytesPerSecond] = useState<number>(0);
    const [isAttack, setIsAttack] = useState<boolean>(false);
    const [isAlertActive, setIsAlertActive] = useState<boolean>(false);

    // Mock State for Quarantined Nodes
    const [isolatedNodes, setIsolatedNodes] = useState<Set<string>>(new Set());
    const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
    // Raw per-packet probability → drives the fast-moving gauge bar
    const [confidence, setConfidence] = useState<number>(0);
    // Smoothed moving-average probability → drives alert overlays & spotlight
    const [smoothedProbability, setSmoothedProbability] = useState<number>(0);
    const [targetDevice, setTargetDevice] = useState<string | null>(null);
    const [attackType, setAttackType] = useState<string | null>(null);
    const [devices, setDevices] = useState<Record<string, DeviceState>>({});

    const [isMounted, setIsMounted] = useState<boolean>(false);
    const router = useRouter();

    const [theme, setTheme] = useState<'dark' | 'light'>('dark');

    // Set mounted flag after client render to avoid SSR mismatch
    useEffect(() => {
        setIsMounted(true);
        // Theme init
        const savedTheme = localStorage.getItem('fedshield_theme') as 'dark' | 'light' | null;
        if (savedTheme) {
            setTheme(savedTheme);
            if (savedTheme === 'light') document.documentElement.classList.remove('dark');
            else document.documentElement.classList.add('dark');
        } else {
            document.documentElement.classList.add('dark');
        }

        // Security Perimeter Check
        const token = localStorage.getItem('fedshield_api_key');
        if (!token) {
            router.push('/login');
        }
    }, [router]);

    const toggleTheme = () => {
        setTheme(prev => {
            const next = prev === 'dark' ? 'light' : 'dark';
            localStorage.setItem('fedshield_theme', next);
            if (next === 'light') document.documentElement.classList.remove('dark');
            else document.documentElement.classList.add('dark');
            return next;
        });
    };

    // Additional state variables
    const [xaiData, setXaiData] = useState<XAIData[]>([]);
    const [xaiReport, setXaiReport] = useState<XAIData[]>([]);
    const [logs, setLogs] = useState<string[]>([]);
    const [clock, setClock] = useState<string>('');
    const [reasoning, setReasoning] = useState<string>('');

    // Performance Metrics
    const [f1Score, setF1Score] = useState<number>(0);
    const [precision, setPrecision] = useState<number>(0);
    const [accuracy, setAccuracy] = useState<number>(0);
    const [confusionMatrix, setConfusionMatrix] = useState<number[][]>([]);

    // Federated Learning UI State
    const [flPhase, setFlPhase] = useState<string | null>(null);
    const [flTarget, setFlTarget] = useState<string | null>(null);
    const [flMessage, setFlMessage] = useState<string | null>(null);

    // Incident Report UI State
    const [incidentReport, setIncidentReport] = useState<any>(null);
    const [ldpState, setLdpState] = useState<{ node: string, state: string } | null>(null);
    const lastFlTargetRef = useRef<string | null>(null);

    const wsRef = useRef<WebSocket | null>(null);

    // ── Dynamic Detection Threshold ──────────────────────────────────────────────
    // Local mirror of the backend detection_threshold. Drives:
    //   • alert-active check (instant UI response without waiting for next broadcast)
    //   • threshold line positions on the probability gauges
    //   • slider position
    const [detectionThreshold, setDetectionThreshold] = useState<number>(0.85);
    // Whether the user is currently dragging (throttle WS sends while dragging)
    const lastSentThreshold = useRef<number>(0.85);
    // ──────────────────────────────────────────────────────────────────────────────

    // Live clock
    useEffect(() => {
        const timer = setInterval(() => setClock(new Date().toLocaleTimeString()), 1000);
        return () => clearInterval(timer);
    }, []);

    // WebSocket handling
    useEffect(() => {
        let reconnectTimer: NodeJS.Timeout;
        const connect = () => {
            wsRef.current = new WebSocket(WS_URL);
            const ws = wsRef.current;
            ws.onopen = () => console.log('WebSocket connected');
            ws.onmessage = (event) => {
                try {
                    const data: WSMessage = JSON.parse(event.data);

                    if (data.type === 'NOTIFICATION') {
                        if (data.msg?.includes('isolated')) {
                            toast.success(data.msg, { icon: '🔒' });
                        } else {
                            toast(data.msg || '', { icon: '🔓' });
                        }
                        return;
                    }

                    if (data.type === 'FEDERATION_CYCLE') {
                        setFlPhase(data.phase || null);
                        setFlTarget(data.target || null);
                        setFlMessage(data.msg || null);

                        if (data.target && data.target !== 'all' && data.target !== 'server') {
                            lastFlTargetRef.current = data.target;
                        }

                        if (data.phase === 'PHASE_GLOBAL_BROADCAST') {
                            if (lastFlTargetRef.current) {
                                fetch(`${API_URL}/api/report/${lastFlTargetRef.current}`, {
                                    credentials: 'include',
                                    headers: {
                                        'X-API-Key': API_KEY,
                                        'Authorization': `Bearer ${API_KEY}`
                                    }
                                })
                                    .then(res => {
                                        if (res.status === 401) {
                                            toast.error("Authentication Error: Access Denied by Security Perimeter Gateway.", { icon: '🛑' });
                                            return { error: true };
                                        }
                                        return res.json();
                                    })
                                    .then(reportData => {
                                        if (!reportData.error) {
                                            setIncidentReport({ deviceId: lastFlTargetRef.current, ...reportData });
                                        }
                                    })
                                    .catch(console.error);
                            }

                            setTimeout(() => {
                                setFlPhase(null);
                                setFlTarget(null);
                                setFlMessage(null);
                            }, 5000);
                        }
                        return;
                    }

                    if (data.type === 'FL_STATUS' && data.node && data.state) {
                        setLdpState({ node: data.node, state: data.state });
                        const timeStr = new Date().toLocaleTimeString();
                        if (data.state === 'PERTURBING_WEIGHTS') {
                            setLogs((prev: string[]) => [...prev.slice(-50), `> [${timeStr}] SECURE_CHANNEL | Node ${data.node?.toUpperCase()} weights randomized via Laplace noise layer. Sensitivity delta bounded.`]);
                        } else if (data.state === 'DISPATCHING_ENCRYPTED_PAYLOAD') {
                            setLogs((prev: string[]) => [...prev.slice(-50), `> [${timeStr}] OUTBOUND | Transmission payload dispatched via TLS 1.3 channel to centralized aggregation core.`]);
                        }
                        return;
                    }

                    // Sync slider from backend echo (handles reconnects)
                    if (data.detection_threshold !== undefined) {
                        setDetectionThreshold(data.detection_threshold);
                        lastSentThreshold.current = data.detection_threshold;
                    }

                    if (data.devices) {
                        setDevices(data.devices);
                    }

                    // Sum up PPS
                    let totalPps = 0;
                    let maxProb = 0;
                    let activeTarget: string | null = null;

                    Object.entries(data.devices || {}).forEach(([label, devData]: [string, any]) => {
                        totalPps += (devData.pps || 0);
                        if (devData.rawProb > maxProb) {
                            maxProb = devData.rawProb;
                        }
                        if (devData.status === 'Critical') {
                            activeTarget = label;
                        }
                    });

                    // Calculate Alert State
                    const sp = data.smoothed_probability ?? 0;
                    setSmoothedProbability(sp);
                    let alertActive = sp >= detectionThreshold || activeTarget !== null;

                    setIsolatedNodes(prevIso => {
                        const currentIso = prevIso;
                        let mergedDevices = { ...data.devices } as Record<string, DeviceState>;

                        // Override quarantined devices
                        currentIso.forEach(dev => {
                            if (mergedDevices[dev]) {
                                mergedDevices[dev] = { ...mergedDevices[dev], is_isolated: true, status: 'QUARANTINED' };
                            }
                        });

                        setDevices(mergedDevices);

                        if (activeTarget && currentIso.has(activeTarget)) {
                            setIsAlertActive(false);
                            setIsAttack(false);
                        } else {
                            setIsAlertActive(alertActive);
                            setIsAttack(alertActive);
                        }

                        return currentIso;
                    });

                    // If an attack is active, show the attacked device's pps, otherwise show aggregate
                    if (activeTarget && !isolatedNodes.has(activeTarget)) {
                        setTargetDevice(activeTarget);
                        setPacketsPerSecond(data.devices?.[activeTarget]?.pps || totalPps);
                        setConfidence(data.devices?.[activeTarget]?.rawProb || maxProb);
                        setAttackType(data.devices?.[activeTarget]?.attack_type || null);
                    } else {
                        setTargetDevice(null);
                        setPacketsPerSecond(totalPps);
                        setConfidence(maxProb);
                        setAttackType(null);
                    }

                    if (data.xai_top_features) setXaiData(data.xai_top_features);
                    if (data.xai_report) setXaiReport(data.xai_report);

                    // Update Performance Overhaul Metrics
                    if (data.f1_score !== undefined) setF1Score(data.f1_score);
                    if (data.precision !== undefined) setPrecision(data.precision);
                    if (data.accuracy !== undefined) setAccuracy(data.accuracy);
                    if (data.confusionMatrix) setConfusionMatrix(data.confusionMatrix);

                    // Append log entry
                    const cp = data.current_probability ?? 0;
                    const devStatus = data.status || 'BENIGN';
                    const logMsg = `[${new Date().toLocaleTimeString()}] ${devStatus} | raw=${cp.toFixed(3)} | avg=${sp.toFixed(3)} | f1=${(data.f1_score || 0).toFixed(2)}`;
                    setLogs((prev: string[]) => [...prev.slice(-50), logMsg]);
                } catch (err) {
                    console.error('WS parse error', err);
                }
            };
            ws.onerror = (err) => console.error('WS error', err);
            ws.onclose = () => {
                console.log('WS closed, reconnecting...');
                reconnectTimer = setTimeout(connect, 3000);
            };
        };
        connect();
        return () => {
            clearTimeout(reconnectTimer);
            wsRef.current?.close();
        };
    }, []);

    const dispatchAttack = (type: string, targetDeviceTarget: string) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action: 'LAUNCH_ATTACK', type, target: targetDeviceTarget }));
        }
    };

    const dispatchReset = () => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ action: 'RESET' }));
        }
    };

    const triggerIsolation = async (deviceName: string) => {
        try {
            const res = await fetch(`${API_URL}/api/mitigate`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': API_KEY,
                    'Authorization': `Bearer ${API_KEY}`
                },
                body: JSON.stringify({ device_id: deviceName })
            });
            if (res.status === 401) {
                toast.error("Authentication Error: Access Denied by Security Perimeter Gateway.", { icon: '🛑' });
                return;
            }
        } catch (e) {
            console.error("API error", e);
        }
        setIsolatedNodes(prev => new Set(prev).add(deviceName));
        toast.success(`Node ${deviceName} ISOLATED.`, { icon: '🔒' });
    };

    const triggerRestore = async (deviceId: string) => {
        try {
            const res = await fetch(`${API_URL}/api/mitigate`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': API_KEY,
                    'Authorization': `Bearer ${API_KEY}`
                },
                body: JSON.stringify({ device_id: deviceId })
            });
            if (res.status === 401) {
                toast.error("Authentication Error: Access Denied by Security Perimeter Gateway.", { icon: '🛑' });
                return;
            }
            setIsolatedNodes(prev => {
                const next = new Set(prev);
                next.delete(deviceId);
                return next;
            });
            toast.success(`Node ${deviceId} RESTORED. FL CYCLE INITIATED.`, { icon: '🔓' });
        } catch (e) {
            console.error("API error", e);
            toast.error("Failed to restore node.");
        }
    };


    // Send threshold update to backend (called on slider change)
    const sendThreshold = useCallback((val: number) => {
        const rounded = Math.round(val * 100) / 100;
        if (wsRef.current?.readyState === WebSocket.OPEN && rounded !== lastSentThreshold.current) {
            wsRef.current.send(JSON.stringify({ action: 'SET_THRESHOLD', value: rounded }));
            lastSentThreshold.current = rounded;
        }
    }, []);

    const handleThresholdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const val = parseFloat(e.target.value);
        setDetectionThreshold(val);
        sendThreshold(val);
    };

    // Camera control handlers (passed to 3D component via ref)
    const threeRef = useRef<any>(null);
    const setCameraMode = (mode: 'city' | 'top' | 'iso' | 'dive') => {
        if (threeRef.current && threeRef.current.setCameraMode) {
            threeRef.current.setCameraMode(mode);
        }
    };

    // Helper to format bytes
    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B/s';
        const k = 1024;
        const sizes = ['B/s', 'KB/s', 'MB/s'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    // Determine model verdict using smoothed probability to match alert states
    const modelVerdict = smoothedProbability >= detectionThreshold ? `MALICIOUS_${attackType?.toUpperCase() || 'UNKNOWN'}` : 'BENIGN';
    const isAnyIsolated = Object.values(devices).some(d => d.is_isolated);

    return (

        <main className="relative w-full h-screen bg-[#fafafa] text-[#18181b] dark:bg-[#050505] dark:text-white overflow-hidden font-mono selection:bg-rose-500/30 transition-colors duration-300 ease-in-out">

            {/* Global Header */}
            <header className={`absolute top-0 left-0 right-0 h-14 flex items-center justify-between px-6 backdrop-blur-xl border-b z-40 transition-colors duration-500 ${isAlertActive ? 'bg-[#fef2f2]/90 dark:bg-rose-950/40 border-[#fecaca] dark:border-rose-900/50' : 'bg-[#ffffff]/80 dark:bg-white/5 border-[#e4e4e7] dark:border-white/10'}`}>
                <div className="flex items-center gap-4">
                    <h1 className={`text-xl font-bold tracking-widest transition-colors ${isAlertActive ? 'text-[#7f1d1d] dark:text-rose-400' : 'text-[#18181b] dark:text-cyan-400'}`}>SECURE NODE ALPHA</h1>
                    {isAlertActive && (
                        <div className="flex items-center gap-2 bg-rose-900/30 px-3 py-1 rounded border border-rose-800/50 shadow-[0_0_15px_rgba(159,18,57,0.3)]">
                            <ShieldAlert className="w-4 h-4 text-rose-400 animate-pulse" />
                            <span className="text-xs text-rose-300 font-bold uppercase tracking-widest drop-shadow-md">
                                ACTIVE THREAT: {attackType || 'UNKNOWN'}
                            </span>
                        </div>
                    )}
                </div>
                <div className="flex items-center space-x-4">
                    <button
                        onClick={toggleTheme}
                        className="p-1.5 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
                        title="Toggle Theme"
                    >
                        {theme === 'dark' ? <Sun className="w-5 h-5 text-cyan-300" /> : <Moon className="w-5 h-5 text-[#52525b]" />}
                    </button>
                    <Clock className={`w-5 h-5 transition-colors ${isAlertActive ? 'text-[#7f1d1d] dark:text-rose-400' : 'text-[#52525b] dark:text-cyan-300'}`} />
                    {isMounted && <span className={`text-sm font-mono transition-colors ${isAlertActive ? 'text-[#7f1d1d] dark:text-rose-300' : 'text-[#52525b] dark:text-cyan-300'}`}>{clock}</span>}
                    <span className={`px-3 py-1 rounded-full text-xs font-bold tracking-widest uppercase transition-colors ${isAlertActive ? 'bg-[#fef2f2] dark:bg-rose-900/50 border border-[#fecaca] dark:border-rose-700 text-[#7f1d1d] dark:text-rose-300' : 'bg-[#e8fee8] dark:bg-green-900/50 border border-[#bbf7d0] dark:border-green-700 text-[#2e3b2e] dark:text-green-400'}`}>
                        {isAlertActive ? 'BREACH_IN_PROGRESS' : 'NETWORK_STABLE'}
                    </span>
                </div>
            </header>

            <aside className={`absolute top-16 left-2 w-52 h-[calc(100vh-8rem)] bg-[#ffffff] dark:bg-white/10 backdrop-blur-xl border rounded-xl p-3 z-50 flex flex-col space-y-3 transition-colors duration-500 ${isAlertActive ? 'border-[#fecaca] dark:border-rose-900/50 bg-[#fef2f2] dark:bg-rose-950/10' : 'border-[#e4e4e7] dark:border-white/20'}`}>
                <h2 className="text-sm font-semibold text-[#18181b] dark:text-cyan-300 mb-2">Federated Nodes</h2>
                <div className="flex flex-col space-y-2 overflow-y-auto max-h-full pr-1 flex-1">
                    {UNIFIED_DEVICES.map((dev) => {
                        const devState = devices[dev.id];
                        const isIsolated = devState?.is_isolated;
                        const isCritical = devState?.status === 'Critical';
                        const metadata = DEVICE_METADATA[dev.id];
                        const isActive = activeNodeId === dev.id;

                        return (
                            <div key={dev.id} className="bg-black/20 p-1.5 rounded-lg border border-[#e4e4e7] dark:border-[#22222a] flex flex-col transition-all duration-300 overflow-hidden">
                                <div
                                    className="flex items-center space-x-1.5 cursor-pointer hover:bg-black/10 dark:hover:bg-white/5 p-0.5 rounded transition-colors"
                                    onClick={() => setActiveNodeId(isActive ? null : dev.id)}
                                >
                                    <dev.icon className={`w-4 h-4 transition-colors duration-500 ${isIsolated ? 'text-gray-500 grayscale' : 'text-cyan-400'}`} />
                                    <div className="flex flex-col flex-1">
                                        <span className={`text-[10px] font-bold transition-colors ${isIsolated ? 'text-gray-500' : 'text-[#18181b] dark:text-cyan-200'}`}>{dev.label}</span>
                                        <span className={`text-[7px] uppercase tracking-tighter ${isIsolated ? 'text-gray-600' : isCritical ? 'text-red-500 animate-pulse' : 'text-green-500/70'}`}>
                                            {isIsolated ? 'OFFLINE' : devState?.status || 'Searching...'}
                                        </span>
                                    </div>
                                    <RefreshCw className={`w-2.5 h-2.5 text-cyan-500/50 ${isAttack && !isIsolated ? 'animate-spin' : ''}`} />
                                </div>

                                <div className={`flex flex-col overflow-hidden transition-all duration-300 ${isActive ? 'max-h-[200px] opacity-100 mt-2' : 'max-h-0 opacity-0 mt-0'}`}>
                                    {metadata && (
                                        <div className="flex flex-col space-y-1 bg-[#ffffff] dark:bg-black/40 p-2 rounded border border-[#e4e4e7] dark:border-[#22222a] mb-1.5">
                                            <div className="text-[10px] text-[#3f3f46] dark:text-gray-400 font-mono flex items-start space-x-1">
                                                <span className="w-4 mt-[1px]">🛠️</span>
                                                <span className="flex-1">FIRMWARE: {metadata.firmware}</span>
                                            </div>
                                            <div className="text-[10px] text-[#3f3f46] dark:text-gray-400 font-mono flex items-start space-x-1">
                                                <span className="w-4 mt-[1px]">🕷️</span>
                                                <span className="flex-1">KNOWN EXPLOIT: {metadata.cve}</span>
                                            </div>
                                            <div className="text-[10px] text-[#3f3f46] dark:text-gray-400 font-mono flex items-start space-x-1">
                                                <span className="w-4 mt-[1px]">🎯</span>
                                                <span className="flex-1 flex items-center">
                                                    RISK LEVEL:
                                                    <span className={`ml-1 px-1.5 py-[1px] rounded ${metadata.risk === 'LOW' ? 'text-[#22c55e] bg-emerald-950/20' : 'text-[#ef4444] bg-red-950/20'}`}>
                                                        {metadata.risk}
                                                    </span>
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {/* Mitigation Actions Relocated Here */}
                                    <div className="pt-0.5 flex flex-col space-y-1">
                                        {isIsolated ? (
                                            <button
                                                onClick={() => triggerRestore(dev.id)}
                                                className="w-full flex items-center justify-center gap-1 px-1 py-1 bg-cyan-500/20 border border-cyan-500/50 rounded text-[8px] text-cyan-400 hover:bg-cyan-500/40 transition font-bold"
                                            >
                                                <RefreshCw className="w-2.5 h-2.5" /> RESTORE NODE
                                            </button>
                                        ) : isCritical && (
                                            <div className="flex flex-col space-y-1">
                                                <button
                                                    disabled={f1Score <= 0.75}
                                                    onClick={() => triggerIsolation(dev.id)}
                                                    className={`w-full flex items-center justify-center gap-1 px-1 py-1 rounded text-[8px] transition font-bold ${f1Score > 0.75 ? 'bg-red-500/20 border border-red-500/50 text-red-400 hover:bg-red-500/40 animate-bounce' : 'bg-gray-500/20 border border-gray-500/50 text-gray-500 cursor-not-allowed'}`}
                                                >
                                                    <ShieldOff className="w-2.5 h-2.5" /> {f1Score > 0.75 ? 'ISOLATE' : 'LOCKING...'}
                                                </button>
                                                {f1Score <= 0.75 && (
                                                    <span className="text-[6px] text-red-500 font-black text-center animate-pulse">
                                                        [SAFETY_LOCK: F1 &lt; 75%]
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>


            </aside>

            {/* Right Sidebar – Live Analytics */}
            <aside className={`absolute top-16 right-2 w-72 h-[calc(100vh-8rem)] bg-[#ffffff] dark:bg-white/10 backdrop-blur-xl border rounded-xl px-4 pt-4 pb-12 z-50 flex flex-col space-y-4 overflow-y-auto custom-scrollbar transition-colors duration-500 ${isAlertActive ? 'border-[#fecaca] dark:border-rose-900/50 bg-[#fef2f2] dark:bg-rose-950/10' : 'border-[#e4e4e7] dark:border-white/20'}`}>
                <h2 className="text-sm font-semibold text-[#18181b] dark:text-cyan-300 mb-2">Live Analytics</h2>

                {/* AI SENSITIVITY CALIBRATION Slider (Moved to Top) */}
                <div className="flex flex-col space-y-2 pb-4 border-b border-cyan-500/30">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-1">
                            <SlidersHorizontal className="w-3 h-3 text-cyan-400" />
                            <span className="text-[10px] font-bold text-cyan-300 tracking-widest uppercase">
                                AI_SENSITIVITY_CALIBRATION
                            </span>
                        </div>
                        <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${detectionThreshold < 0.65 ? 'bg-orange-500/30 text-orange-300' : 'bg-cyan-500/20 text-cyan-300'}`}>
                            {(detectionThreshold * 100).toFixed(0)}%
                        </span>
                    </div>
                    <div className="flex justify-between text-[9px] text-gray-400">
                        <span className={detectionThreshold < 0.65 ? 'text-orange-400 font-bold' : ''}>VERY_SENSITIVE</span>
                        <span className={detectionThreshold >= 0.80 ? 'text-cyan-400 font-bold' : ''}>STRICT_ROBUST</span>
                    </div>
                    <style>{`
                    .threshold-slider {
                        -webkit-appearance: none;
                        width: 100%;
                        height: 4px;
                        border-radius: 2px;
                        background: linear-gradient(to right, #06b6d4 0%, #06b6d4 ${((detectionThreshold - 0.50) / (0.99 - 0.50)) * 100}%, #1f2937 ${((detectionThreshold - 0.50) / (0.99 - 0.50)) * 100}%, #1f2937 100%);
                        box-shadow: 0 0 8px rgba(6, 182, 212, 0.5);
                    }
                    .custom-scrollbar::-webkit-scrollbar {
                        width: 6px;
                        height: 6px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-track {
                        background: transparent;
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb {
                        background-color: rgba(75, 85, 99, 0.4);
                        border-radius: 10px;
                    }
                    .custom-scrollbar::-webkit-scrollbar-thumb:hover {
                        background-color: #34d399;
                    }
                    .threshold-slider::-webkit-slider-thumb {
                        -webkit-appearance: none;
                        width: 14px;
                        height: 14px;
                        border-radius: 50%;
                        background: ${detectionThreshold < 0.65 ? '#f97316' : '#06b6d4'};
                        border: 2px solid ${detectionThreshold < 0.65 ? '#fb923c' : '#67e8f9'};
                    }
                `}</style>
                    <input
                        type="range"
                        min={0.50}
                        max={0.99}
                        step={0.01}
                        value={detectionThreshold}
                        onChange={handleThresholdChange}
                        className="threshold-slider"
                    />
                </div>
                <div className="flex flex-col space-y-3">
                    {/* Packets Per Second */}
                    <div className="flex justify-between items-center">
                        <span className="text-xs text-cyan-200">PPS</span>
                        <span className="text-lg font-mono text-cyan-100">{packetsPerSecond.toLocaleString()}</span>
                    </div>

                    {/* Raw Probability – fast gauge with dynamic threshold line */}
                    <div className="flex flex-col space-y-1">
                        <div className="flex justify-between">
                            <span className="text-xs text-cyan-200">Raw Prob. (live)</span>
                            <span className="text-xs font-mono text-cyan-100">{(confidence * 100).toFixed(1)}%</span>
                        </div>
                        {/* Gauge track with threshold dotted line overlay */}
                        <div className="relative w-full h-3">
                            <div className="absolute inset-0 bg-gray-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-cyan-400 transition-all duration-150"
                                    style={{ width: `${(confidence * 100).toFixed(0)}%` }}
                                />
                            </div>
                            {/* Dotted threshold line */}
                            <div
                                className="absolute top-0 bottom-0 w-0 border-l-2 border-dashed border-red-500 transition-all duration-300"
                                style={{ left: `${(detectionThreshold * 100).toFixed(1)}%` }}
                            />
                        </div>
                        {/* Threshold label below raw gauge */}
                        <div className="relative h-3">
                            <span
                                className="absolute text-[9px] text-red-400 font-mono -translate-x-1/2 transition-all duration-300"
                                style={{ left: `${(detectionThreshold * 100).toFixed(1)}%` }}
                            >
                                {(detectionThreshold * 100).toFixed(0)}%
                            </span>
                        </div>
                    </div>

                    {/* Smoothed Probability – alert trigger with threshold line */}
                    <div className="flex flex-col space-y-1">
                        <div className="flex justify-between">
                            <span className="text-xs text-cyan-200">Smoothed Avg. (10-frame)</span>
                            <span className={`text-xs font-mono ${smoothedProbability >= detectionThreshold ? 'text-red-400' : 'text-green-400'}`}>
                                {(smoothedProbability * 100).toFixed(1)}%
                            </span>
                        </div>
                        <div className="relative w-full h-3">
                            <div className="absolute inset-0 bg-gray-700 rounded-full overflow-hidden">
                                <div
                                    className={`h-full transition-all duration-500 ${smoothedProbability >= detectionThreshold ? 'bg-red-500' : 'bg-amber-400'}`}
                                    style={{ width: `${(smoothedProbability * 100).toFixed(0)}%` }}
                                />
                            </div>
                            {/* Dotted threshold line moves with slider */}
                            <div
                                className="absolute top-0 bottom-0 w-0 border-l-2 border-dashed border-red-500 transition-all duration-300"
                                style={{ left: `${(detectionThreshold * 100).toFixed(1)}%` }}
                            />
                        </div>
                        {/* Threshold label */}
                        <div className="relative h-3">
                            <span
                                className="absolute text-[9px] text-red-400 font-mono -translate-x-1/2 transition-all duration-300"
                                style={{ left: `${(detectionThreshold * 100).toFixed(1)}%` }}
                            >
                                ▲ {(detectionThreshold * 100).toFixed(0)}%
                            </span>
                        </div>
                    </div>

                    {/* Model Verdict */}
                    <div className="flex justify-between items-center pt-1">
                        <span className="text-xs text-[#52525b] dark:text-cyan-200">Verdict</span>
                        <span className={`px-2 py-0.5 rounded border text-xs font-medium ${modelVerdict !== 'BENIGN' ? 'bg-[#fef2f2] dark:bg-red-600 text-[#7f1d1d] dark:text-white border-[#fecaca] dark:border-transparent' : 'bg-[#f0fdf4] dark:bg-green-600 text-[#166534] dark:text-white border-[#bbf7d0] dark:border-transparent'}`}>
                            INFERENCE: {modelVerdict}
                        </span>
                    </div>

                    {/* ── EXPLAINABLE AI // ROOT CAUSE FORENSICS ── */}
                    <div className="flex flex-col space-y-2 pt-2 border-t border-cyan-500/30 flex-1">
                        <div className="flex items-center space-x-1 mb-1">
                            <Activity className="w-3 h-3 text-cyan-400" />
                            <span className="text-[10px] font-bold text-cyan-300 tracking-widest uppercase">
                                EXPLAINABLE_AI_FORENSICS
                            </span>
                        </div>

                        <div className="flex-1 flex flex-col space-y-6 overflow-y-auto custom-scrollbar  bg-[#ffffff] dark:bg-black/40 border border-[#e4e4e7] dark:border-[#22222a] rounded-lg">
                            {isAnyIsolated ? (
                                <div className="py-4 px-4 bg-[#f0f7ff] dark:bg-[#0f141c] border border-[#cbd5e1] dark:border-blue-900/40 rounded-md animate-in fade-in zoom-in duration-500 min-h-[80px]">
                                    <p className="text-[11px] font-medium leading-relaxed text-[#0f172a] dark:text-[#a1a1aa]">
                                        🛡️ <span className="font-bold text-blue-600 dark:text-[#38bdf8]">Automated Mitigation Active:</span> Target device has been programmatically quarantined from the primary local smart home network infrastructure. Core traffic features have been forced into an administrative drop state to isolate the malicious footprint, successfully containing the threat vector at the perimeter firewall gateway.
                                    </p>
                                </div>
                            ) : modelVerdict === 'BENIGN' ? (
                                <div className="text-[10px] font-mono text-[#3f3f46]/70 dark:text-gray-500 italic py-4 px-4 bg-[#f4f4f5] dark:bg-black/20 rounded-md border border-[#e4e4e7] dark:border-white/5 min-h-[80px]">
                                    {"> System operating within nominal baseline parameters. Neural network layers show zero dominant adversarial feature weights."}
                                </div>
                            ) : (
                                <div className="flex flex-col space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                                    {attackType?.toUpperCase() === 'DDOS' ? (
                                        <>
                                            <div className="py-4 px-4 bg-[#ffffff] dark:bg-white/5 border border-[#e4e4e7] dark:border-white/10 rounded-md min-h-[80px]">
                                                <p className="text-[10px] font-medium leading-relaxed text-[#3f3f46] dark:text-[#a1a1aa]">
                                                    📈 <span className="font-bold text-[#a855f7] dark:text-cyan-400">Volumetric Pipeline Flood:</span> Packet distribution intensity has surpassed critical thresholds, verifying a coordinated volumetric saturation attempt designed to exhaust network interface buffers.
                                                </p>
                                            </div>
                                            <div className="py-4 px-4 bg-[#ffffff] dark:bg-white/5 border border-[#e4e4e7] dark:border-white/10 rounded-md min-h-[80px]">
                                                <p className="text-[10px] font-medium leading-relaxed text-[#3f3f46] dark:text-[#a1a1aa]">
                                                    ⚡ <span className="font-bold text-[#a855f7] dark:text-cyan-400">Protocol State Exhaustion:</span> Anomalous clustering of TCP SYN/ACK control structures detected, confirming a state-table starvation exploit targeting local gateway ports.
                                                </p>
                                            </div>
                                            <div className="py-4 px-4 bg-[#ffffff] dark:bg-white/5 border border-[#e4e4e7] dark:border-white/10 rounded-md min-h-[80px]">
                                                <p className="text-[10px] font-medium leading-relaxed text-[#3f3f46] dark:text-[#a1a1aa]">
                                                    ⏱ <span className="font-bold text-[#a855f7] dark:text-cyan-400">Short-Lived Concurrent Streams:</span> Extremely brief individual network flow durations logged, confirming high-concurrency automated thread firing mechanics.
                                                </p>
                                            </div>
                                        </>
                                    ) : attackType?.toUpperCase() === 'MIRAI' ? (
                                        <>
                                            <div className="py-4 px-4 bg-[#ffffff] dark:bg-white/5 border border-[#e4e4e7] dark:border-white/10 rounded-md min-h-[80px]">
                                                <p className="text-[10px] font-medium leading-relaxed text-[#3f3f46] dark:text-[#a1a1aa]">
                                                    🤖 <span className="font-bold text-[#a855f7] dark:text-cyan-400">Botnet Structural Footprint:</span> Non-standard packet header length configurations detected, mapping perfectly to custom malformed frames generated by Mirai command-and-control infrastructure.
                                                </p>
                                            </div>
                                            <div className="py-4 px-4 bg-[#ffffff] dark:bg-white/5 border border-[#e4e4e7] dark:border-white/10 rounded-md min-h-[80px]">
                                                <p className="text-[10px] font-medium leading-relaxed text-[#3f3f46] dark:text-[#a1a1aa]">
                                                    🔍 <span className="font-bold text-[#a855f7] dark:text-cyan-400">Vertical/Horizontal Port Scanning:</span> Rapid, successive variations in target destination socket rings observed, indicating active background scanning behavior to locate accessible IoT backdoors.
                                                </p>
                                            </div>
                                            <div className="py-4 px-4 bg-[#ffffff] dark:bg-white/5 border border-[#e4e4e7] dark:border-white/10 rounded-md min-h-[80px]">
                                                <p className="text-[10px] font-medium leading-relaxed text-[#3f3f46] dark:text-[#a1a1aa]">
                                                    📦 <span className="font-bold text-[#a855f7] dark:text-cyan-400">Uniform Payload Constellations:</span> Highly uniform, asymmetric byte-size distribution profiles identified, indicating repetitive automated script block injections attempting device takeover.
                                                </p>
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-[10px] font-mono text-gray-500 italic py-4 px-4 bg-[#f4f4f5] dark:bg-black/20 rounded-md border border-[#e4e4e7] dark:border-white/5 min-h-[80px]">
                                            {"> Compiling forensic feature vectors..."}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>



                    {/* Bottom Sidebar Terminal */}
                    <div className="flex flex-col space-y-2 pt-2 border-t border-cyan-500/30">
                        <div className="flex items-center space-x-1">
                            <Terminal className="w-3 h-3 text-cyan-400" />
                            <span className="text-[10px] font-bold text-cyan-300 tracking-widest uppercase">
                                SYSTEM_LOGS
                            </span>
                        </div>
                        <div className="h-[150px] max-h-[150px] overflow-y-auto bg-[#f4f4f5] dark:bg-black/40 rounded-lg p-2 border border-[#e4e4e7] dark:border-white/5 scrollbar-hide">
                            {logs.map((line: string, i: number) => (
                                <div key={i} className="text-[8px] font-mono text-[#52525b] dark:text-gray-400 leading-tight mb-1">
                                    <span className="text-cyan-600 dark:text-cyan-500/50 tracking-tighter mr-1">{'>'}</span>
                                    {line}
                                </div>
                            ))}
                        </div>
                    </div>

                </div>
            </aside>

            {/* Removed Global Bottom Terminal - Moved to Sidebar */}

            {/* Central Canvas Container */}
            <div className="absolute inset-0 flex items-center justify-center">
                <div className="relative w-full h-full">
                    {/* Camera Controls */}
                    <div className="absolute bottom-4 right-4 flex space-x-2 z-20">
                        <button onClick={() => setCameraMode('top')} className="px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-white hover:bg-white/20 transition">TOP_DOWN</button>
                        <button onClick={() => setCameraMode('iso')} className="px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-white hover:bg-white/20 transition">ISO_VIEW</button>
                        <button onClick={() => setCameraMode('dive')} className="px-2 py-1 bg-white/10 border border-white/20 rounded text-xs text-white hover:bg-white/20 transition">DIVE_TO_TARGET</button>
                    </div>
                    {/* Federated Engine Ledger Overlay */}
                    {flPhase && (
                        <div className="absolute top-8 left-1/2 -translate-x-1/2 z-50 bg-indigo-950/90 border border-indigo-500/50 rounded-xl p-4 shadow-[0_0_30px_rgba(79,70,229,0.4)] backdrop-blur-md w-96 flex flex-col items-center">
                            <div className="flex items-center space-x-2 mb-2">
                                <div className="w-2 h-2 rounded-full bg-indigo-400 animate-ping" />
                                <h3 className="text-xs font-bold text-indigo-300 uppercase tracking-widest">Federated Engine Ledger</h3>
                            </div>
                            <div className="text-center w-full">
                                <div className="text-[10px] text-indigo-200 font-mono mb-1 bg-black/40 px-2 py-1 rounded">
                                    PHASE: <span className="text-white font-bold">{flPhase.replace('PHASE_', '')}</span>
                                </div>
                                <div className="text-[9px] text-gray-300 min-h-[24px]">
                                    {flMessage}
                                </div>
                            </div>
                        </div>
                    )}

                    <ModernHouse3D
                        ref={threeRef}
                        isAttack={isAttack}
                        targetDevice={targetDevice}
                        isAlertActive={isAlertActive}
                        packetsPerSecond={packetsPerSecond}
                        devices={devices}
                        flPhase={flPhase}
                        flTarget={flTarget}
                        theme={theme}
                        ldpState={ldpState}
                    />
                </div>
            </div>
        </main>
    );
}

function randomDuration(min: number, max: number) {
    return Math.random() * (max - min) + min;
}
