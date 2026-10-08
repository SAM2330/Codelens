import React from "react";

interface MetricCardProps {
    title: string;
    value: number | string;
    subtitle?: string;
    icon?: React.ReactNode;
    color?: "blue" | "cyan" | "emerald" | "amber" | "rose" | "purple";
}

export const MetricCard: React.FC<MetricCardProps> = ({
    title,
    value,
    subtitle,
    icon,
    color = "blue"
}) => {
    return (
        <div className="metric-card">
            <div>
                <div className="metric-title">{title}</div>
                <div className="metric-value">{value}</div>
                {subtitle && <div className="metric-subtitle">{subtitle}</div>}
            </div>
            {icon && (
                <div className={`metric-icon-box badge-${color}`}>
                    {icon}
                </div>
            )}
        </div>
    );
};
