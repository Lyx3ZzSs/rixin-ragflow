export function IconButton({ children, className = "sidebar-toggle", label, pressed, title, onClick, type = "button" }) {
  const props = pressed === undefined ? {} : { "aria-pressed": pressed };

  return (
    <button className={className} type={type} aria-label={label} title={title} onClick={onClick} {...props}>
      {children}
    </button>
  );
}
