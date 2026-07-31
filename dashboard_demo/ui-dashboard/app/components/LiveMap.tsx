'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Video, Tv, Refrigerator, Lock, Server, ShieldAlert, ShieldCheck, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface XAIData {
    feature: string;
    weight: number;
}

interface WSMessage {
    status: 'BENIGN' | 'ATTACK';
    probability?: number;
    xai_data?: XAIData[];
    p_s: number;
    b_s: number;
    device_activity: { camera: boolean; tv: boolean; fridge: boolean; lock: boolean };
}

const DEVICE_DEFS = [
    { id: 'camera', icon: Video, label: 'Camera', x: 20, y: 20 },
    { id: 'tv', icon: Tv, label: 'Smart TV', x: 80, y: 20 },
    { id: 'fridge', icon: Refrigerator, label: 'Fridge', x: 20, y: 80 },
    { id: 'lock', icon: Lock, label: 'Smart Lock', x: 80, y: 80 },
];

export default function LiveMap() {
    const [packetsPerSecond, setPacketsPerSecond] = useState<number>(0);
    const [bytesPerSecond, setBytesPerSecond] = useState<number>(0);
    const [isAttack, setIsAttack] = useState<boolean>(false);
    
    const [xaiData, setXaiData] = useState<XAIData[]>([]);
    const [deviceActivity, setDeviceActivity] = useState<{camera: boolean, tv: boolean, fridge: boolean, lock: boolean}>({
        camera: false, tv: false, fridge: false, lock: false
    });
    const [probability, setProbability] = useState<number>(0);

    useEffect(() => {
        let ws: WebSocket;
        let reconnectTimer: NodeJS.Timeout;

        const connect = () => {
            const wsUrl = `ws://192.168.56.1:8000/ws`;
            console.log("Connecting to WebSocket on:", wsUrl);
            ws = new WebSocket(wsUrl);
            
            ws.onopen = () => console.log("FastAPI WebSocket Connected!");
            
            ws.onmessage = (event) => {
                try {
                    const data: WSMessage = JSON.parse(event.data);
                    
                    setIsAttack(data.status === 'ATTACK');
                    setPacketsPerSecond(data.p_s || 0);
                    setBytesPerSecond(data.b_s || 0);
                    
                    if (data.probability !== undefined) setProbability(data.probability);
                    if (data.device_activity) setDeviceActivity(data.device_activity);
                    if (data.xai_data) setXaiData(data.xai_data);

                } catch (err) {
                    console.error("Error parsing incoming JSON stream:", err);
                }
            };
            
            ws.onerror = (err) => console.error("WebSocket Error Triggered:", err);
            
            ws.onclose = () => {
                console.log("WebSocket Disconnected. Reconnecting in 3s...");
                reconnectTimer = setTimeout(connect, 3000);
            };
        };
        
        connect();

        return () => {
            clearTimeout(reconnectTimer);
            if (ws && ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        };
    }, []);

    const formatBytes = (bytes: number) => {
        if (bytes === 0) return '0 B/s';
        const k = 1024;
        const sizes = ['B/s', 'KB/s', 'MB/s'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    };

    return (
        <div className="relative w-full h-screen bg-neutral-950 text-white overflow-hidden flex font-sans selection:bg-rose-500/30">
            <div className="flex-1 relative flex flex-col items-center justify-center p-8 z-10 transition-all duration-500">
                
                <div className="absolute top-6 left-6 flex space-x-6 z-20">
                    <div className="bg-neutral-900/40 backdrop-blur-md border border-neutral-800 rounded-2xl p-4 flex items-center space-x-4 shadow-[0_8px_30px_rgb(0,0,0,0.4)]">
                        {isAttack ? (
                            <ShieldAlert className="text-rose-500 w-9 h-9 animate-pulse drop-shadow-[0_0_15px_rgba(244,63,94,0.5)]" />
                        ) : (
                            <ShieldCheck className="text-emerald-500 w-9 h-9 drop-shadow-[0_0_15px_rgba(16,185,129,0.3)]" />
                        )}
                        <div>
                            <p className="text-[11px] text-neutral-400 uppercase tracking-widest font-semibold">Active Intrusion Detect</p>
                            <p className={`text-2xl font-black tracking-tight ${isAttack ? 'text-rose-500' : 'text-emerald-500'}`}>
                                {isAttack ? 'ATTACK' : 'BENIGN'} <span className="opacity-70 font-medium text-lg">{(probability * 100).toFixed(1)}%</span>
                            </p>
                        </div>
                    </div>
                    
                    <div className="bg-neutral-900/40 backdrop-blur-md border border-neutral-800 rounded-2xl p-4 flex items-center space-x-4 shadow-[0_8px_30px_rgb(0,0,0,0.4)]">
                        <Activity className="text-blue-500 w-9 h-9 drop-shadow-[0_0_15px_rgba(59,130,246,0.4)]" />
                        <div>
                            <p className="text-[11px] text-neutral-400 uppercase tracking-widest font-semibold">Traffic Sensor Throughput</p>
                            <p className="text-2xl font-bold tracking-tight text-neutral-100">
                                {packetsPerSecond} <span className="text-sm font-medium text-neutral-500">p/s</span> • {formatBytes(bytesPerSecond)}
                            </p>
                        </div>
                    </div>
                </div>

                <div className="absolute top-12 flex flex-col items-center">
                    <motion.div 
                        className="relative bg-blue-900/20 p-5 rounded-3xl border border-blue-500/40 backdrop-blur shadow-[0_0_40px_rgba(59,130,246,0.15)]"
                        animate={{ boxShadow: ['0 0 20px rgba(59,130,246,0.1)', '0 0 70px rgba(59,130,246,0.5)', '0 0 20px rgba(59,130,246,0.1)'] }}
                        transition={{ duration: 3.5, repeat: Infinity }}
                    >
                        <Server className="w-14 h-14 text-blue-400 drop-shadow-md" />
                    </motion.div>
                    <span className="mt-4 text-blue-300 font-bold tracking-[0.2em] text-xs uppercase opacity-80 shadow-black drop-shadow-md">Global FDL Server</span>
                </div>

                <motion.div
                    className="absolute top-40 w-1.5 h-40 bg-gradient-to-t from-blue-500 to-transparent rounded-full opacity-60 filter blur-[1px]"
                    animate={{ y: [120, -60], opacity: [0, 1, 0] }}
                    transition={{ duration: 2, repeat: Infinity, ease: "linear", delay: 1 }}
                />

                <div className="relative w-[700px] h-[450px] mt-48 border border-neutral-800/60 rounded-[40px] bg-neutral-900/20 backdrop-blur-xl shadow-2xl p-8 overflow-hidden">
                    <div className="absolute top-6 left-8 text-neutral-600 font-bold uppercase tracking-[0.3em] text-xs">Edge Network Topography</div>
                    
                    <div className="absolute inset-0 bg-[url('https://transparenttextures.com/patterns/cubes.png')] opacity-[0.03] pointer-events-none" />

                    {DEVICE_DEFS.map((dev) => {
                        const Icon = dev.icon;
                        const hasActivity = deviceActivity[dev.id as keyof typeof deviceActivity];
                        const activelyBeingAttacked = isAttack && hasActivity;
                        
                        return (
                            <motion.div 
                                key={dev.id}
                                className={`absolute transform -translate-x-1/2 -translate-y-1/2 flex flex-col items-center z-10`}
                                style={{ left: `${dev.x}%`, top: `${dev.y}%` }}
                            >
                                <motion.div
                                    className={`p-5 rounded-3xl border backdrop-blur-md shadow-lg ${activelyBeingAttacked ? 'bg-rose-950/90 border-rose-500' : 'bg-emerald-950/20 border-emerald-500/20'}`}
                                    animate={activelyBeingAttacked ? {
                                        boxShadow: ['0 0 30px rgba(244,63,94,0.5)', '0 0 80px rgba(244,63,94,0.9)', '0 0 30px rgba(244,63,94,0.5)'],
                                        scale: [1, 1.15, 1]
                                    } : {
                                        boxShadow: ['0 0 15px rgba(16,185,129,0.1)', '0 0 40px rgba(16,185,129,0.3)', '0 0 15px rgba(16,185,129,0.1)'],
                                        scale: 1
                                    }}
                                    transition={{ duration: activelyBeingAttacked ? 0.3 : 2, repeat: Infinity }}
                                >
                                    <Icon className={`w-10 h-10 ${activelyBeingAttacked ? 'text-rose-400 drop-shadow-[0_0_10px_#f43f5e]' : 'text-emerald-400 opacity-80'}`} />
                                </motion.div>
                                <span className={`mt-4 font-bold text-sm tracking-wide ${activelyBeingAttacked ? 'text-rose-400 drop-shadow-md' : 'text-emerald-500/60'}`}>{dev.label}</span>

                                <AnimatePresence>
                                    {activelyBeingAttacked && (
                                        <motion.div 
                                            initial={{ opacity: 0 }} 
                                            animate={{ opacity: 1 }} 
                                            exit={{ opacity: 0 }}
                                            className="absolute top-1/2 -left-40 w-40 h-2 overflow-visible"
                                        >
                                            {[...Array(6)].map((_, i) => (
                                                <motion.div
                                                    key={i}
                                                    className="absolute w-2.5 h-1 bg-rose-500 rounded-full shadow-[0_0_15px_#f43f5e]"
                                                    animate={{ x: [-120, 20], opacity: [0, 1, 0], scaleX: [1, 3, 1] }}
                                                    transition={{ duration: 0.5, repeat: Infinity, delay: i * 0.1 }}
                                                />
                                            ))}
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </motion.div>
                        );
                    })}
                </div>
            </div>

            <AnimatePresence>
                {isAttack && xaiData.length > 0 && (
                    <motion.div 
                        initial={{ x: 500, opacity: 0, scale: 0.95 }}
                        animate={{ x: 0, opacity: 1, scale: 1 }}
                        exit={{ x: 500, opacity: 0, scale: 0.95 }}
                        transition={{ type: "spring", stiffness: 250, damping: 28 }}
                        className="w-[480px] h-full bg-neutral-900/95 backdrop-blur-2xl border-l border-neutral-800/80 shadow-[-20px_0_50px_rgba(0,0,0,0.5)] z-50 flex flex-col p-8"
                    >
                        <div className="flex items-center space-x-4 mb-10 pb-6 border-b border-neutral-800/50">
                            <div className="p-3 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                                <ShieldAlert className="w-8 h-8 text-rose-500" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-bold text-white tracking-tight">Explainable AI Core</h2>
                                <p className="text-sm text-rose-400/80 font-medium tracking-wide">SHAP Gradient Identification</p>
                            </div>
                        </div>

                        <div className="flex-1 flex flex-col bg-black/40 rounded-3xl border border-neutral-800/60 p-8 shadow-inner overflow-hidden">
                            <h3 className="text-[11px] uppercase tracking-[0.2em] text-neutral-500 font-bold mb-8 flex items-center">
                                <span className="w-2 h-2 rounded-full bg-rose-500 mr-3 animate-pulse"></span>
                                Top 5 Architectural Anomalies
                            </h3>
                            
                            <div className="w-full h-[350px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={xaiData} layout="vertical" margin={{ top: 0, right: 20, left: 20, bottom: 0 }}>
                                        <XAxis type="number" hide />
                                        <YAxis 
                                            dataKey="feature" 
                                            type="category" 
                                            axisLine={false} 
                                            tickLine={false} 
                                            tick={{ fill: '#a3a3a3', fontSize: 13, fontWeight: 500 }} 
                                            width={140}
                                        />
                                        <Tooltip 
                                            cursor={{ fill: '#171717', opacity: 0.8 }}
                                            contentStyle={{ backgroundColor: 'rgba(10,10,10,0.9)', border: '1px solid #404040', borderRadius: '12px', backdropFilter: 'blur(10px)', color: '#fff' }}
                                            itemStyle={{ color: '#f43f5e', fontWeight: 600 }}
                                        />
                                        <Bar dataKey="weight" radius={[0, 6, 6, 0]} barSize={24}>
                                            {xaiData.map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={index === 0 ? '#e11d48' : '#fb7185'} stroke={index === 0 ? '#f43f5e' : 'none'} strokeWidth={index === 0 ? 2 : 0} />
                                            ))}
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>

                            <div className="mt-10 pt-8 border-t border-neutral-800/60 flex items-start space-x-4">
                                <div className="mt-1 flex-shrink-0 w-8 h-8 rounded-full bg-neutral-800 border border-neutral-700 flex items-center justify-center">
                                    <span className="text-rose-500 font-black text-sm">!</span>
                                </div>
                                <p className="text-[13px] text-neutral-400 leading-relaxed font-medium">
                                    The Hybrid CNN-LSTM detected an explicit attack signature via standard deviation mapping.
                                    The graph visually demonstrates the dominant neural-weights isolating this detection via exact PyTorch GradientExplainer signatures.
                                </p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
            
        </div>
    );
}
