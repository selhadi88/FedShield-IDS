"use client";
import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Lock, Video, Refrigerator, Terminal, Zap, ShieldAlert, Cpu, ChevronRight, Moon, Sun } from "lucide-react";

// Types
type ViewState = "HOME" | "NETWORK" | "COMMAND";
type AttackState = "IDLE" | "BREACHING" | "INJECTING" | "GRANTED";

import { UNIFIED_DEVICES } from "../../lib/constants";
import { API_URL, WS_URL } from '@/lib/config';

const ATTACKS = ["Mirai C2 Botnet Injection", "DDoS Flood"];
const SYSTEM_BYPASS_KEY = process.env.NEXT_PUBLIC_API_KEY || 'your_fallback_high_entropy_token_here';

export default function MobileRemote() {
  const [view, setView] = useState<ViewState>("HOME");
  const [selectedDevice, setSelectedDevice] = useState<string | null>(null);
  const [selectedAttack, setSelectedAttack] = useState<string>(ATTACKS[0]);
  const [attackState, setAttackState] = useState<AttackState>("IDLE");
  
  const [isGlitching, setIsGlitching] = useState(false);
  const [holdProgress, setHoldProgress] = useState(0);

  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  // Network and Metrics
  const [hasMounted, setHasMounted] = useState(false);
  const [metrics, setMetrics] = useState({ p_s: 0, status: "OFFLINE", devices: {} as Record<string, any> });
  const [isConnected, setIsConnected] = useState(false);
  const [terminalLogs, setTerminalLogs] = useState<string[]>(["SYSTEM BOOTING..."]);

  const socketRef = useRef<WebSocket | null>(null);
  const holdIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const addLog = (log: string) => {
    setTerminalLogs(prev => [...prev.slice(-4), `> ${log}`]);
  };

  useEffect(() => {
    setHasMounted(true);
    // Theme init
    const savedTheme = localStorage.getItem('fedshield_theme') as 'dark' | 'light' | null;
    if (savedTheme) {
        setTheme(savedTheme);
        if (savedTheme === 'light') document.documentElement.classList.remove('dark');
        else document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.add('dark');
    }

    addLog("PHASE 1: MOUNTED");

    const connect = () => {
      try {
        addLog("ATTEMPTING HANDSHAKE...");
        
const ws = new WebSocket(WS_URL);

        ws.onopen = () => {
          addLog("LINK ESTABLISHED!");
          setIsConnected(true);
          setMetrics(prev => ({ ...prev, status: "LIVE" }));
        };

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            setMetrics({
              p_s: data.p_s || 0,
              status: data.status || "ACTIVE",
              devices: data.devices || {}
            });
            // If the status is CRITICAL, we can trigger the attack state color globally
          } catch (e) {
            // ignore
          }
        };

        ws.onclose = (e) => {
          setIsConnected(false);
          addLog(`LINK LOST - RECONNECTING...`);
          setTimeout(connect, 3000);
        };

        socketRef.current = ws;
      } catch (err) {
        addLog("CRASH: " + err);
      }
    };

    connect();

    return () => {
      if (socketRef.current) socketRef.current.close();
    };
  }, []);

  const sendAction = (payload: object) => {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify(payload));
    }
  };

  // Hold to execute logic
  const startHold = () => {
    if (attackState !== "IDLE") return;
    setHoldProgress(0);
    const interval = setInterval(() => {
      setHoldProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          executeAttack();
          return 100;
        }
        return prev + 5; // 20 ticks = 1 second hold
      });
    }, 50);
    holdIntervalRef.current = interval;
  };

  const endHold = () => {
    if (holdIntervalRef.current) clearInterval(holdIntervalRef.current);
    if (holdProgress < 100 && attackState === "IDLE") {
      setHoldProgress(0);
    }
  };

  const executeAttack = () => {
    setIsGlitching(true);
    setTimeout(() => setIsGlitching(false), 500);

    setAttackState("BREACHING");
    addLog("Breaching...");
    
    // Map attack type for backend logic
    const attackMap: Record<string, string> = {
      "Mirai C2 Botnet Injection": "MIRAI",
      "DDoS Flood": "DDOS"
    };

    setTimeout(async () => {
      setAttackState("INJECTING");
      addLog("Injecting Payloads...");
      
      try {
        const res = await fetch(`${API_URL}/api/attack`, {
          method: 'POST',
          headers: { 
              'Content-Type': 'application/json',
              'X-API-Key': SYSTEM_BYPASS_KEY
          },
          body: JSON.stringify({ device_id: selectedDevice || "smart_lock", attack_type: attackMap[selectedAttack] || "mirai" })
        });
        if (res.status === 401) {
           addLog("Authentication Error: Access Denied by Security Perimeter Gateway.");
           setAttackState("IDLE");
           return;
        }
      } catch (err) {
        console.error("API error", err);
      }
      
      setTimeout(() => {
        setAttackState("GRANTED");
        addLog("Access Granted. Root Shell Open.");
        setTimeout(() => setAttackState("IDLE"), 3000);
      }, 1500);
    }, 1500);
  };
  
  const resetSystem = () => {
      sendAction({ action: "RESET" });
      addLog("SYSTEM RESET INITIATED.");
      setView("HOME");
  };

  const toggleTheme = () => {
      setTheme(prev => {
          const next = prev === 'dark' ? 'light' : 'dark';
          localStorage.setItem('fedshield_theme', next);
          if (next === 'light') document.documentElement.classList.remove('dark');
          else document.documentElement.classList.add('dark');
          return next;
      });
  };

  if (!hasMounted) return null;

  const isCritical = metrics.status.includes("CRITICAL") || metrics.status === "ATTACK" || attackState !== "IDLE";
  const themeColor = isCritical ? "text-red-500" : (theme === 'light' ? "text-slate-800" : "text-cyan-400");
  const borderColor = isCritical ? "border-red-500" : (theme === 'light' ? "border-slate-400" : "border-cyan-400");
  const bgColor = isCritical ? "bg-red-500" : (theme === 'light' ? "bg-slate-800" : "bg-cyan-400");
  const bgGlow = isCritical ? "shadow-[0_0_15px_#ef4444]" : (theme === 'light' ? "shadow-[0_0_15px_#94a3b8]" : "shadow-[0_0_15px_#22d3ee]");

  return (
    <div className={`min-h-[100dvh] bg-[#fafafa] dark:bg-[#0a0a0c] text-slate-900 dark:text-white font-mono overflow-x-hidden overflow-y-auto relative transition-colors duration-300 ease-in-out ${isGlitching ? 'animate-[shake_0.5s_ease-in-out]' : ''}`}>
      {/* CRT Scanline Overlay */}
      <div className={`fixed inset-0 pointer-events-none z-50 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] bg-[length:100%_4px,3px_100%] opacity-20 mix-blend-screen ${theme === 'light' ? 'hidden' : ''}`}></div>

      <style dangerouslySetInnerHTML={{__html: `
        @keyframes shake {
          0% { transform: translate(1px, 1px) rotate(0deg); }
          10% { transform: translate(-1px, -2px) rotate(-1deg); }
          20% { transform: translate(-3px, 0px) rotate(1deg); }
          30% { transform: translate(3px, 2px) rotate(0deg); }
          40% { transform: translate(1px, -1px) rotate(1deg); }
          50% { transform: translate(-1px, 2px) rotate(-1deg); }
          60% { transform: translate(-3px, 1px) rotate(0deg); }
          70% { transform: translate(3px, 1px) rotate(-1deg); }
          80% { transform: translate(-1px, -1px) rotate(1deg); }
          90% { transform: translate(1px, 2px) rotate(0deg); }
          100% { transform: translate(1px, -2px) rotate(-1deg); }
        }
      `}} />

      {/* Header */}
      <header className={`p-4 border-b border-dashed ${borderColor} flex justify-between items-center opacity-90 backdrop-blur-sm z-10 relative bg-white/50 dark:bg-transparent`}>
        <div className="flex flex-col">
          <div className="text-[10px] tracking-[0.3em] font-black opacity-50 text-slate-500 dark:text-gray-400">CTOS v2.0</div>
          <motion.div layoutId="header-title" className={`text-xl font-black tracking-widest uppercase ${themeColor} drop-shadow-[0_0_8px_currentColor]`}>
            DEDSEC_LINK
          </motion.div>
        </div>
        <div className="flex items-center gap-4 text-right">
          <button
              onClick={toggleTheme}
              className="p-1 rounded-full hover:bg-slate-200 dark:hover:bg-white/10 transition-colors"
              title="Toggle Theme"
          >
              {theme === 'dark' ? <Sun className="w-5 h-5 text-cyan-300" /> : <Moon className="w-5 h-5 text-slate-600" />}
          </button>
          <div>
            <div className="text-[9px] tracking-widest opacity-50 text-slate-500 dark:text-gray-400">STATUS</div>
            <div className={`text-xs font-bold uppercase drop-shadow-md ${isConnected ? themeColor : 'text-slate-400 dark:text-gray-500'} ${isCritical ? 'animate-pulse' : ''}`}>
               {isConnected ? (isCritical ? 'ATTACK_LIVE' : 'UPLINK_LIVE') : 'NO_SIGNAL'}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="p-6 relative z-10 pb-[120px] flex flex-col items-center justify-center min-h-[calc(100vh-80px)]">
        
        <AnimatePresence mode="wait">
          {view === "HOME" && (
            <motion.div
              key="home"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.5, filter: "blur(10px)" }}
              transition={{ duration: 0.5 }}
              className="flex flex-col items-center cursor-pointer w-full"
              onClick={() => setView("NETWORK")}
            >
              <motion.div layoutId="morph-container" className={`relative p-8 border border-dashed ${borderColor} rounded-full ${bgGlow} animate-[pulse_3s_ease-in-out_infinite] bg-black/40`}>
                 <Home className={`w-24 h-24 ${themeColor}`} />
                 <div className="absolute inset-0 border border-t-0 border-l-0 border-white opacity-20 rounded-full animate-[spin_3s_linear_infinite]" />
              </motion.div>
              <div className="mt-12 text-center">
                <p className="text-[10px] tracking-[0.5em] opacity-80 mb-3 text-slate-600 dark:text-white/70 shadow-none dark:shadow-black dark:drop-shadow-lg">TARGET ACQUIRED</p>
                <button className={`px-6 py-3 border ${borderColor} ${themeColor} uppercase text-sm font-black tracking-widest hover:bg-slate-200 dark:hover:bg-cyan-900/30 transition-colors shadow-lg active:scale-95`}>
                  Hack Profile // Tap
                </button>
              </div>
            </motion.div>
          )}

          {view === "NETWORK" && (
            <motion.div
              key="network"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0, x: -50 }}
              className="w-full h-full flex flex-col"
            >
              <div className="mb-6 flex justify-between items-end border-b border-white/10 pb-2">
                <span className={`text-[10px] tracking-[0.2em] font-bold ${theme === 'light' ? 'text-[#52525b]' : 'text-cyan-500'}`}>Scanning Subnet...</span>
                <span className={`text-[10px] opacity-50 animate-pulse ${theme === 'light' ? 'text-[#52525b]' : 'text-cyan-200'}`}>192.168.1.0/24</span>
              </div>
              
              <div className="mb-8 w-full h-[2px] bg-gray-900 relative overflow-hidden">
                <motion.div 
                   initial={{ width: 0 }} 
                   animate={{ width: "100%" }} 
                   transition={{ duration: 2, ease: "linear", repeat: Infinity }}
                   className={`absolute top-0 h-full ${bgColor} shadow-[0_0_10px_currentColor]`} 
                />
              </div>

              <motion.div 
                layoutId="morph-container"
                variants={{
                  hidden: { opacity: 0 },
                  show: {
                    opacity: 1,
                    transition: { staggerChildren: 0.1 }
                  }
                }}
                initial="hidden"
                animate="show"
                className="flex flex-col gap-4 w-full flex-grow border border-dashed border-cyan-900/50 p-2 rounded bg-black/20"
              >
                {UNIFIED_DEVICES.map((device, i) => {
                  const Icon = device.icon;
                  return (
                    <motion.div
                      key={device.id}
                      variants={{
                        hidden: { x: -20, opacity: 0 },
                        show: { x: 0, opacity: 1 }
                      }}
                      whileHover={{ scale: 1.02, x: 10 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => {
                        setSelectedDevice(device.id);
                        setView("COMMAND");
                      }}
                      className={`p-4 border ${theme === 'light' ? 'border-[#e4e4e7] bg-[#ffffff] hover:bg-[#f4f4f5]' : `${borderColor} bg-black/40 hover:bg-cyan-950/40`} backdrop-blur flex justify-between items-center cursor-pointer group relative overflow-hidden transition-colors`}
                    >
                      {/* Isolation Overlay */}
                      {metrics.devices[device.label]?.is_isolated && (
                        <div className="absolute inset-0 bg-red-950/60 z-10 flex items-center justify-center backdrop-blur-sm">
                           <div className="border border-red-500 text-red-500 text-[10px] px-3 py-1 font-black animate-pulse bg-black shadow-[0_0_10px_rgba(220,38,38,0.5)]">
                             OFFLINE // ISOLATED
                           </div>
                        </div>
                      )}
                      
                      {/* Glitch hover block */}
                      <div className="absolute top-0 -left-[100%] w-1/2 h-full bg-gradient-to-r from-transparent via-cyan-500/10 to-transparent group-hover:left-[200%] transition-all duration-700 pointer-events-none" />
                      
                      <div className="flex items-center gap-4">
                        <div className={`p-2 border border-dashed transition-colors ${theme === 'light' ? 'border-[#e4e4e7]' : 'border-cyan-800 group-hover:border-cyan-500'}`}>
                           <Icon className={`w-6 h-6 ${theme === 'light' ? 'text-[#27272a]' : 'text-cyan-500'}`} />
                        </div>
                        <div className="flex flex-col">
                           <span className={`text-[11px] uppercase tracking-[0.1em] font-bold transition-colors ${theme === 'light' ? 'text-[#09090b]' : 'text-gray-300 group-hover:text-cyan-300'}`}>{device.label}</span>
                           <span className={`text-[9px] font-mono mt-0.5 ${theme === 'light' ? 'text-[#71717a]' : 'text-gray-500'}`}>NODE_{i.toString().padStart(3, '0')}</span>
                        </div>
                      </div>
                      <ChevronRight className={`w-4 h-4 transition-colors ${theme === 'light' ? 'text-[#27272a]' : 'text-cyan-800 group-hover:text-cyan-500'}`} />
                    </motion.div>
                  );
                })}
              </motion.div>
              
              <button onClick={() => setView("HOME")} className="mt-8 text-[10px] tracking-[0.2em] uppercase text-cyan-800 hover:text-cyan-500 border-b border-cyan-900 pb-1 flex items-center justify-self-start self-start transition-colors">
                {"<"} Back to Root
              </button>
            </motion.div>
          )}

          {view === "COMMAND" && (
            <motion.div
              key="command"
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="w-full flex flex-col h-full"
            >
              <div className="flex items-center gap-3 mb-8 border-l-[3px] border-red-500 pl-4 py-1">
                 <Cpu className="text-red-500 w-8 h-8 animate-[pulse_2s_ease-in-out_infinite]" />
                 <div>
                   <div className="text-[9px] text-red-500 tracking-[0.3em] font-black opacity-80 mb-0.5">TARGET PROFILER</div>
                   <div className="text-sm font-mono text-gray-200 shadow-[0_0_10px_rgba(255,0,0,0.2)] font-bold tracking-wider">
                     {UNIFIED_DEVICES.find(d => d.id === selectedDevice)?.label.toUpperCase()}
                   </div>
                 </div>
              </div>

              <div className="text-[9px] mb-3 text-gray-500 uppercase tracking-[0.2em] border-b border-gray-800 pb-2">Select Exploit Vector</div>
              
              <div className="grid grid-cols-1 gap-3 mb-auto">
                {ATTACKS.map(attack => (
                  <button
                    key={attack}
                    onClick={() => setSelectedAttack(attack)}
                    className={`py-4 px-4 text-left border text-xs font-bold uppercase tracking-widest transition-all ${selectedAttack === attack ? 'border-red-500 bg-red-950/20 text-red-400 font-black shadow-[inset_0_0_15px_rgba(220,38,38,0.2)]' : 'border-gray-800 text-gray-400 hover:border-gray-600'}`}
                  >
                    <span className={selectedAttack === attack ? 'mr-3 text-red-500 inline-block animate-pulse' : 'hidden'}>{">"}</span>
                    {attack}
                  </button>
                ))}
              </div>

              {/* Hold to Execute */}
              <div className="mt-10 relative">
                 <button
                   onMouseDown={startHold}
                   onMouseUp={endHold}
                   onMouseLeave={endHold}
                   onTouchStart={startHold}
                   onTouchEnd={endHold}
                   disabled={attackState !== "IDLE"}
                   className={`w-full py-6 uppercase font-black tracking-[0.3em] text-sm relative overflow-hidden transition-colors border
                      ${attackState !== "IDLE" ? 'border-red-600/30 text-red-600/50 bg-black cursor-wait' : 'border-red-500 text-red-500 hover:text-white hover:bg-red-950/40 select-none shadow-[0_0_15px_rgba(220,38,38,0.1)] active:scale-[0.98]'}`}
                 >
                   <span className="relative z-10 drop-shadow-md">
                     {attackState === "IDLE" ? "Hold to Execute //" : attackState}
                   </span>
                   {/* Progress Bar Background */}
                   {attackState === "IDLE" && holdProgress > 0 && (
                     <div 
                       className="absolute top-0 left-0 h-full bg-red-600/50 z-0 transition-all duration-75 ease-linear shadow-[0_0_20px_#dc2626]"
                       style={{ width: `${holdProgress}%` }}
                     />
                   )}
                 </button>
                 {attackState === "IDLE" && <div className="text-center text-[9px] text-gray-500 mt-3 tracking-widest font-mono">REQUIRES ELEVATED PRIVILEGES</div>}
              </div>

              <button onClick={() => { resetSystem(); setHoldProgress(0); }} className="mt-8 text-[10px] tracking-[0.2em] uppercase text-gray-500 hover:text-red-500 transition-colors flex items-center justify-center">
                 {"<"} Abort / Return
              </button>
            </motion.div>
          )}
        </AnimatePresence>

      </main>

      {/* Global Terminal Footer */}
      <footer className={`fixed bottom-0 left-0 w-full ${theme === 'light' ? 'bg-[#f4f4f5] border-t border-[#e4e4e7]' : 'bg-black/90 border-t border-gray-900/80'} p-4 flex flex-col gap-1 z-30 backdrop-blur-xl h-[100px] shadow-[0_-10px_30px_rgba(0,0,0,0.1)] dark:shadow-[0_-10px_30px_rgba(0,0,0,0.8)] transition-colors duration-300`}>
         <div className={`text-[8px] flex justify-between mb-1.5 uppercase font-black tracking-widest border-b pb-1.5 ${theme === 'light' ? 'text-[#71717a] border-[#e4e4e7]' : 'text-gray-600 border-gray-800'}`}>
           <span className="flex items-center gap-2"><Terminal className={`w-3 h-3 ${theme === 'light' ? 'text-[#18181b]' : 'text-cyan-700'}`}/> Sys_Console</span>
           {isCritical && <span className="text-red-600 animate-pulse flex items-center gap-1"><ShieldAlert className="w-3 h-3"/> ROOTKIT ACTIVE</span>}
         </div>
         
         <div className="flex flex-col flex-grow justify-end space-y-0.5 overflow-hidden">
           {terminalLogs.map((log, i) => (
             <div key={i} className={`text-[10px] ${isCritical ? 'text-red-500 dark:text-red-400 font-bold drop-shadow-none dark:drop-shadow-[0_0_2px_rgba(220,38,38,0.8)]' : (theme === 'light' ? 'text-[#18181b] font-medium' : 'text-cyan-500 opacity-80')} font-mono whitespace-nowrap`}>
               {log}
             </div>
           ))}
         </div>
         
         {/* System Reset / STOP_ALL_ATTACKS available when under attack */}
         {isCritical && (
             <button
               onClick={resetSystem}
               className="absolute right-4 bottom-4 border-2 border-red-500 bg-red-600 text-white px-4 py-2 text-[10px] uppercase font-black tracking-widest hover:bg-red-700 active:scale-95 transition-all shadow-[0_0_20px_rgba(220,38,38,0.6)] animate-pulse"
             >
               STOP_ALL_ATTACKS
             </button>
         )}
      </footer>

    </div>
  );
}