export function StatusBadge({ children, className = "", title }) {
  return (
    <span className={`status${className ? ` ${className}` : ""}`} title={title}>
      {children}
    </span>
  );
}
