import { Video, Tv, Refrigerator, Lock, Zap, Server, Shield } from 'lucide-react';

export const UNIFIED_DEVICES = [
    // Home Alpha
    { id: 'security_camera', icon: Video, label: 'Camera', home: 'Alpha' },
    { id: 'smart_tv', icon: Tv, label: 'Smart TV', home: 'Alpha' },
    { id: 'fridge', icon: Refrigerator, label: 'Fridge', home: 'Alpha' },
    { id: 'smart_lock', icon: Lock, label: 'Smart Lock', home: 'Alpha' },
    // Home Beta
    { id: 'smart_thermostat', icon: Server, label: 'Thermostat', home: 'Beta' },
    { id: 'smart_blinds', icon: Shield, label: 'Blinds', home: 'Beta' },
    { id: 'energy_meter', icon: Zap, label: 'Energy Meter', home: 'Beta' },
];

export const ATTACK_FAMILIES = ['BENIGN', 'DDOS', 'DOS', 'INJECTION', 'MALWARE', 'MIRAI', 'RECON', 'SPOOFING'];
