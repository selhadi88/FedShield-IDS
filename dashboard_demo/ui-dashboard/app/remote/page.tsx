"use client";
import { useState, useEffect } from 'react';

import { WS_URL } from '@/lib/config';

const devices = ["Smart Lock", "Camera", "Smart TV", "Fridge"];
const attacks = ["DDoS Spike", "Brute Force", "Mirai Botnet"];

export default function MobileRemote() {
  const [selectedDevice, setSelectedDevice] = useState(devices[0]);
  const [data, setData] = useState({ p_s: 0, status: "OFFLINE" });
  const [socket, setSocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    // Pointing to centralized config
    const ws = new WebSocket(WS_URL);
    ws.onmessage = (e) => setData(JSON.parse(e.data));
    setSocket(ws);
    return () => ws.close();
  }, []);

  const sendAttack = (type: string) => {
    if (socket) {
      socket.send(JSON.stringify({
        action: "LAUNCH_ATTACK",
        type: type,
        target: selectedDevice
      }));
    }
  };

  return (
    <div className="min-h-screen bg-[#050505] text-white p-6 flex flex-col font-mono">
      <header className="border-b border-red-900/30 pb-4 mb-6">
        <h1 className="text-red-500 font-bold text-xl tracking-tighter">FDL REMOTE OPS</h1>
        <p className="text-[10px] text-gray-500">SECURE SHELL CONNECTION: ACTIVE</p>
      </header>

      {/* Live Status Header */}
      <div className="bg-gray-900/40 p-4 rounded-xl border border-gray-800 mb-8">
        <div className="flex justify-between text-[10px] text-gray-500 mb-2">
          <span>NETWORK LOAD</span>
          <span>{data.status}</span>
        </div>
        <div className="text-2xl font-bold">{data.p_s} <span className="text-xs text-gray-600">PKTS/S</span></div>
      </div>

      {/* Device Selector */}
      <section className="mb-8">
        <label className="text-[10px] text-gray-500 uppercase mb-2 block">Select Target Node</label>
        <div className="grid grid-cols-2 gap-2">
          {devices.map(d => (
            <button
              key={d}
              onClick={() => setSelectedDevice(d)}
              className={`p-3 rounded-lg border text-xs transition-all ${selectedDevice === d ? 'bg-red-500/20 border-red-500 text-red-500' : 'bg-gray-900 border-gray-800 text-gray-500'}`}
            >
              {d}
            </button>
          ))}
        </div>
      </section>

      {/* Attack Actions */}
      <section className="mt-auto">
        <label className="text-[10px] text-gray-500 uppercase mb-2 block">Payload Execution</label>
        <div className="flex flex-col gap-3">
          {attacks.map(a => (
            <button
              key={a}
              onClick={() => sendAttack(a)}
              className="w-full py-4 bg-red-600 hover:bg-red-700 text-white font-black rounded-xl uppercase tracking-widest shadow-lg shadow-red-900/20 active:scale-95 transition-transform"
            >
              Execute {a}
            </button>
          ))}
          <button
            onClick={() => socket?.send(JSON.stringify({ action: "RESET" }))}
            className="w-full py-4 border border-gray-700 text-gray-500 rounded-xl uppercase text-xs"
          >
            Reset Environment
          </button>
        </div>
      </section>
    </div>
  );
}
