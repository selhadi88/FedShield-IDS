'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Eye, EyeOff, ShieldAlert, ShieldCheck, Lock } from 'lucide-react';
import { API_URL } from '@/lib/config';
import toast from 'react-hot-toast';

export default function LoginPage() {
    const router = useRouter();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    const [errorMsg, setErrorMsg] = useState<string | null>(null);

    const handleLogin = async (e: React.FormEvent) => {
        e.preventDefault();
        
        if (username !== 'admin' || password !== 'admin') {
            setErrorMsg("Access Denied: Invalid Username or Password.");
            return;
        }

        setIsAuthenticating(true);
        setErrorMsg(null);

        try {
            const backendToken = process.env.NEXT_PUBLIC_API_KEY || 'your_fallback_high_entropy_token_here';
            
            // Pre-flight validation ping using a dummy device ID to check for 401 Unauthorized
            const res = await fetch(`${API_URL}/api/report/health_check`, {
                method: 'GET',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': backendToken
                }
            });

            if (res.status === 401) {
                setErrorMsg("Access Denied: High-Entropy Token Verification Failed.");
            } else {
                // If it doesn't 401, the token is valid (even if the device is not found).
                localStorage.setItem('fedshield_api_key', backendToken);
                toast.success("Validation Successful: Security Perimeter Gateway Opened.", {
                    icon: '🟢',
                    style: {
                        background: '#1c1c1c',
                        color: '#6ee7b7',
                        border: '1px solid #34d399'
                    }
                });
                
                // Transition directly onto the main system dashboard route
                router.push('/');
            }
        } catch (err) {
            console.error("Authentication Error", err);
            setErrorMsg("Network Error: Cannot reach the Security Perimeter Gateway.");
        } finally {
            setIsAuthenticating(false);
        }
    };

    return (
        <div className="min-h-screen bg-[#0a0a0a] text-gray-200 font-mono flex items-center justify-center p-4 relative overflow-hidden">
            {/* Ambient Background Glow */}
            <div className="absolute inset-0 z-0 pointer-events-none">
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-900/10 blur-[120px] rounded-full" />
            </div>

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
                className="relative z-10 w-full max-w-md bg-[#121212] border border-[#2a2a2a] p-8 shadow-2xl backdrop-blur-sm"
            >
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 mb-4 flex items-center justify-center border border-[#2a2a2a] bg-[#0f0f0f]">
                        <Lock className="w-6 h-6 text-emerald-600/80" />
                    </div>
                    <h1 className="text-xs tracking-[0.3em] text-center font-bold text-gray-300">
                        🚨 FEDSHIELD-IDS //<br/>ACCESS PERIMETER GATEWAY
                    </h1>
                </div>

                <form onSubmit={handleLogin} className="space-y-6">
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold ml-1">
                                Username
                            </label>
                            <input
                                type="text"
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                                placeholder="Enter Username..."
                                disabled={isAuthenticating}
                                className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-gray-200 text-sm px-4 py-3 outline-none transition-all duration-300 focus:border-emerald-700/50 focus:shadow-[0_0_15px_rgba(4,120,87,0.15)] placeholder:text-gray-700 disabled:opacity-50"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-[10px] uppercase tracking-widest text-gray-500 font-bold ml-1">
                                Password
                            </label>
                            <div className="relative group">
                                <input
                                    type={showPassword ? 'text' : 'password'}
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Enter Password..."
                                    disabled={isAuthenticating}
                                    className="w-full bg-[#0a0a0a] border border-[#2a2a2a] text-gray-200 text-sm px-4 py-3 outline-none transition-all duration-300 focus:border-emerald-700/50 focus:shadow-[0_0_15px_rgba(4,120,87,0.15)] placeholder:text-gray-700 disabled:opacity-50"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors focus:outline-none"
                                >
                                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                                </button>
                            </div>
                        </div>
                    </div>

                    <AnimatePresence>
                        {errorMsg && (
                            <motion.div
                                initial={{ opacity: 0, height: 0 }}
                                animate={{ opacity: 1, height: 'auto' }}
                                exit={{ opacity: 0, height: 0 }}
                                className="overflow-hidden"
                            >
                                <div className="flex items-start gap-3 p-3 bg-red-950/20 border border-red-900/50 text-red-400 text-[11px] uppercase tracking-wide">
                                    <ShieldAlert className="w-4 h-4 mt-0.5 shrink-0" />
                                    <span>{errorMsg}</span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>

                    <button
                        type="submit"
                        disabled={isAuthenticating}
                        className="w-full bg-[#1a1a1a] border border-[#333] hover:border-emerald-800 hover:bg-emerald-950/30 text-gray-300 text-xs font-bold uppercase tracking-[0.2em] py-4 transition-all duration-300 disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {isAuthenticating ? (
                            <>
                                <div className="w-3 h-3 border-2 border-gray-500 border-t-emerald-500 rounded-full animate-spin" />
                                <span>Verifying Protocol...</span>
                            </>
                        ) : (
                            <>
                                <ShieldCheck className="w-4 h-4 opacity-50" />
                                <span>Establish Connection</span>
                            </>
                        )}
                    </button>
                </form>

                <div className="mt-8 text-center border-t border-[#1a1a1a] pt-4">
                    <p className="text-[8px] text-gray-600 uppercase tracking-widest font-bold">
                        Warning: Unauthorized access is strictly prohibited.<br/>
                        All connection attempts are logged to the SOC.
                    </p>
                </div>
            </motion.div>
        </div>
    );
}
