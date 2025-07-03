// src/components/TopMenu.jsx
import React, { useRef, useEffect } from "react";
import { Capacitor } from "@capacitor/core";

const TopMenu = ({
  menuOpen,
  toggleMenu,
  onOpenFiles,
  onExportSHP,
  onClearMap,
  onCloseApp,
}) => {
  const isAndroid = Capacitor.getPlatform() === "android";
  const containerRef = useRef(null);

  // Effect: when menuOpen, listen for clicks outside
  useEffect(() => {
    if (!menuOpen) return;
    const handleOutsideClick = e => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        toggleMenu(false);     // now this *does* set it to false
      }
    };
    document.addEventListener("mousedown", handleOutsideClick);
    return () => document.removeEventListener("mousedown", handleOutsideClick);
  }, [menuOpen, toggleMenu]);

  const containerStyle = {
    position: "absolute",
    top: isAndroid ? 35 : 0,
    left: 0,
    right: 0,
    height: 56,
    backgroundColor: "#fff",
    display: "flex",
    alignItems: "center",
    padding: "0 16px",
    boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
    zIndex: 1000,
  };

  const buttonStyle = {
    background: "none",
    border: "none",
    padding: "8px 12px",
    marginRight: 8,
    borderRadius: 4,
    cursor: "pointer",
    fontSize: 16,
    display: "flex",
    alignItems: "center",
    transition: "background 0.2s",
  };

  const iconStyle = {
    width: 24,
    height: 24,
    marginRight: 8,
  };

  const menuStyle = {
    position: "absolute",
    top: 56,
    left: 16,
    backgroundColor: "#fff",
    borderRadius: 8,
    boxShadow: "0 4px 8px rgba(0,0,0,0.2)",
    minWidth: 200,
    overflow: "hidden",
    zIndex: 1001,
  };

  const menuItemStyle = {
    padding: "12px 16px",
    cursor: "pointer",
    transition: "background 0.2s",
  };

  return (
    <div style={containerStyle} ref={containerRef}>
      <button
        style={{
          ...buttonStyle,
          ...(menuOpen
            ? { backgroundColor: "#e0e0e0" }
            : { backgroundColor: "transparent" }),
        }}
        onClick={() => toggleMenu()}      >
        {/* Gradient Hamburger Icon */}
        <svg
          style={iconStyle}
          viewBox="0 0 24 24"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="grad" x1="0%" y1="50%" x2="100%" y2="50%">
              <stop offset="0%" stopColor="#4facfe" />
              <stop offset="100%" stopColor="#00f2fe" />
            </linearGradient>
          </defs>
          <rect x="3" y="5" width="18" height="2.5" rx="1.25" fill="url(#grad)" />
          <rect x="3" y="11" width="18" height="2.5" rx="1.25" fill="url(#grad)" />
          <rect x="3" y="17" width="18" height="2.5" rx="1.25" fill="url(#grad)" />
        </svg>
        Archivo
      </button>

      {menuOpen && (
        <div style={menuStyle}>
          {[
            { label: "Abrir nuevo…", action: onOpenFiles },
            { label: "Exportar Shapefile…", action: onExportSHP },
            { label: "Limpiar mapa", action: onClearMap },
          ].map(({ label, action }) => (
            <div
              key={label}
              style={menuItemStyle}
              onClick={action}
              onMouseEnter={(e) =>
                (e.currentTarget.style.backgroundColor = "#f5f5f5")
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.backgroundColor = "transparent")
              }
            >
              {label}
            </div>
          ))}
          <div style={{ height: 1, backgroundColor: "#eee", margin: "4px 0" }} />
          <div
            style={menuItemStyle}
            onClick={onCloseApp}
            onMouseEnter={(e) =>
              (e.currentTarget.style.backgroundColor = "#f5f5f5")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.backgroundColor = "transparent")
            }
          >
            Cerrar aplicación
          </div>
        </div>
      )}
    </div>
  );
};

export default TopMenu;
