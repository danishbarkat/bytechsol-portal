/// <reference types="nativewind/types" />
import React from 'react';
import { View } from 'react-native';
import * as LucideIcons from 'lucide-react-native';

interface Icon3DProps {
    icon: keyof typeof LucideIcons;
    variant?: 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    className?: string; // Additional classes
}

const Icon3D: React.FC<Icon3DProps> = ({
    icon,
    variant = 'blue',
    size = 'md',
    className = ''
}) => {
    const IconComponent = LucideIcons[icon] as React.ElementType;

    if (!IconComponent) return null;

    // Manual mapping for NativeWind classes since dynamic class names can be tricky
    let containerClasses = "flex items-center justify-center rounded-2xl border bg-white shadow-sm";
    let iconColor = "#2563eb";

    if (variant === 'blue') {
        containerClasses += " border-blue-100 bg-blue-50";
        iconColor = "#2563eb";
    } else if (variant === 'emerald') {
        containerClasses += " border-emerald-100 bg-emerald-50";
        iconColor = "#10b981";
    } else if (variant === 'amber') {
        containerClasses += " border-amber-100 bg-amber-50";
        iconColor = "#f59e0b";
    } else if (variant === 'rose') {
        containerClasses += " border-rose-100 bg-rose-50";
        iconColor = "#f43f5e";
    } else if (variant === 'violet') {
        containerClasses += " border-violet-100 bg-violet-50";
        iconColor = "#8b5cf6";
    } else if (variant === 'slate') {
        containerClasses += " border-slate-100 bg-slate-50";
        iconColor = "#64748b";
    }

    const sizeMap = {
        xs: { padding: "p-1.5", size: 16 },
        sm: { padding: "p-2", size: 20 },
        md: { padding: "p-2.5", size: 24 },
        lg: { padding: "p-3", size: 28 },
        xl: { padding: "p-4", size: 36 },
    };

    const { padding, size: iconSize } = sizeMap[size];

    // Apply shadow styles manually since NativeWind shadows are limited on Android/iOS
    const shadowStyle = {
        shadowColor: variant === 'blue' ? '#2563eb' : '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 4, // Android shadow
    };

    return (
        <View style={shadowStyle}>
            <View className={`${containerClasses} ${padding} ${className}`}>
                <IconComponent
                    size={iconSize}
                    color={iconColor}
                    strokeWidth={2.5}
                />
            </View>
        </View>
    );
};

export default Icon3D;
