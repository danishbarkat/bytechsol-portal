import React from 'react';
import * as LucideIcons from 'lucide-react';

interface Icon3DProps {
    icon: keyof typeof LucideIcons;
    variant?: 'blue' | 'emerald' | 'amber' | 'rose' | 'violet' | 'slate';
    size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
    className?: string;
    iconClassName?: string;
}

const Icon3D: React.FC<Icon3DProps> = ({
    icon,
    variant = 'blue',
    size = 'md',
    className = '',
    iconClassName = ''
}) => {
    const IconComponent = LucideIcons[icon] as React.ElementType;

    const sizeClasses = {
        xs: 'w-8 h-8 p-1.5',
        sm: 'w-10 h-10 p-2',
        md: 'w-12 h-12 p-2.5',
        lg: 'w-14 h-14 p-3',
        xl: 'w-20 h-20 p-4',
    };

    const iconSizes = {
        xs: 14,
        sm: 18,
        md: 22,
        lg: 26,
        xl: 36,
    };

    if (!IconComponent) return null;

    return (
        <div className={`icon-3d-container icon-3d-${variant} ${sizeClasses[size]} ${className}`}>
            <IconComponent
                size={iconSizes[size]}
                strokeWidth={3}
                className={`icon-3d-inner ${iconClassName}`}
            />
        </div>
    );
};

export default Icon3D;
