import React from "react";

interface TechnologyBadgeProps {
    name: string;
    variant?: "blue" | "cyan" | "emerald" | "amber" | "rose" | "purple" | "gray";
}

export const TechnologyBadge: React.FC<TechnologyBadgeProps> = ({
    name,
    variant = "blue"
}) => {
    return <span className={`badge badge-${variant}`}>{name}</span>;
};
