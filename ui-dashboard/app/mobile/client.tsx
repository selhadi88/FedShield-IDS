"use client";
import { useState, useEffect } from "react";

import { WS_URL } from "@/lib/config";

export default function MobileRemoteClient() {
  const [metrics, setMetrics] = useState({ p_s: 0, status: "OFFLINE" });
  const [socket, setSocket] = useState<any>(null);
  const [debug, setDebug] = useState("STARTING ENGINE...");

  useEffect(() => {
    // If this runs, the bar WILL change
    setDebug("PHASE 1: MOUNTED");

    const startSocket = () => {
      try {
        setDebug(`PHASE 2: CONNECTING TO ${WS_URL}...`);
        const ws = new WebSocket(WS_URL);

        ws.onopen = () => {
          setDebug("PHASE 3: LIVE CONNECTION!");
          setMetrics(m => ({ ...m, status: "CONNECTED" }));
        };

        ws.onmessage = (event) => {
          setDebug("DATA RECEIVED");
          const data = JSON.parse(event.data);
          setMetrics({ p_s: data.p_s, status: data.status });
        };

        ws.onclose = () => setDebug("ERROR: CONNECTION CLOSED");
        ws.onerror = () => setDebug("ERROR: WEBSOCKET FAILED");

        setSocket(ws);
      } catch (e) {
        setDebug("CRASH: " + e);
      }
    };

    startSocket();
    return () => socket?.close();
  }, []);

  return (
    <div style={{ backgroundColor: 'black', color: 'red', minHeight: '100vh', padding: '20px', fontFamily: 'monospace' }}>
      <div style={{ backgroundColor: 'yellow', color: 'black', padding: '10px', fontWeight: 'bold', marginBottom: '20px' }}>
        DEBUG: {debug}
      </div>

      <h1 style={{ fontSize: '24px', fontWeight: 'bold' }}>CYBER-OPS REMOTE</h1>
      <p>STATUS: {metrics.status}</p>

      <div style={{ border: '1px solid red', padding: '20px', margin: '20px 0', textAlign: 'center' }}>
        <h2 style={{ fontSize: '40px', color: 'white' }}>{metrics.p_s} <span style={{ fontSize: '12px' }}>PPS</span></h2>
      </div>

      <button
        onClick={() => socket?.send(JSON.stringify({ action: "LAUNCH_ATTACK", type: "DDoS Spike", target: "Smart Lock" }))}
        style={{ width: '100%', padding: '20px', backgroundColor: 'red', color: 'white', fontWeight: 'bold', border: 'none', marginBottom: '10px' }}
      >
        EXECUTE ATTACK
      </button>

      <button
        onClick={() => socket?.send(JSON.stringify({ action: "RESET" }))}
        style={{ width: '100%', padding: '15px', backgroundColor: 'transparent', color: 'red', border: '1px solid red' }}
      >
        SYSTEM RESET
      </button>
    </div>
  );
}