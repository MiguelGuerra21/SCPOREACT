// src/components/MapViewWrapper.jsx
import React, { useEffect, useRef, useState } from "react";
import { Capacitor } from "@capacitor/core";
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import Extent from "@arcgis/core/geometry/Extent";
import Graphic from "@arcgis/core/Graphic";

const MapViewWrapper = ({
  layersRef,
  setSelectedCount,
  onViewReady,
  initialViewRefs,
}) => {
  const mapDiv = useRef(null);
  const dragHandleRef = useRef(null);
  const clickHandleRef = useRef(null);

  // Estado para el modo multi-selección y su ref
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const multiSelectModeRef = useRef(multiSelectMode);
  multiSelectModeRef.current = multiSelectMode;

  // Detectamos la plataforma (una sola vez)
  const platform = Capacitor.getPlatform();
  // 'web' | 'ios' | 'android' | 'electron' | 'pwa'

  useEffect(() => {
    if (!mapDiv.current) return;

    // 1. Crear el Map y MapView una sola vez
    const map = new Map({ basemap: "streets-vector" });
    const view = new MapView({
      container: mapDiv.current,
      map,
      center: [-100, 40],
      zoom: 4,
    });

    view.when(() => {
      // Notificar al contenedor
      onViewReady?.(view);

      // Guardar estado inicial
      if (initialViewRefs) {
        initialViewRefs.centerRef.current = view.center.clone
          ? view.center.clone()
          : view.center;
        initialViewRefs.zoomRef.current = view.zoom;
        initialViewRefs.extentRef.current = view.extent.clone
          ? view.extent.clone()
          : view.extent;
      }

      // Quitar widget Zoom
      view.ui.remove("zoom");

      // ——— BOX-SELECTION ———
      let dragOrigin = null;
      let boxGraphic = null;

      dragHandleRef.current = view.on("drag", async (event) => {
        const wantsBox =
          event.button === 0 &&
          (
            (["web", "electron"].includes(platform) && event.native.shiftKey) ||
            (["android", "ios"].includes(platform) && multiSelectModeRef.current)
          );
        if (!wantsBox) return;
        event.stopPropagation();

        if (event.action === "start") {
          dragOrigin = [event.x, event.y];
          const p = view.toMap({ x: event.x, y: event.y });
          const initRings = Array(5).fill([p.x, p.y]);
          boxGraphic = new Graphic({
            geometry: {
              type: "polygon",
              rings: [initRings],
              spatialReference: view.spatialReference,
            },
            symbol: {
              type: "simple-fill",
              color: [0, 255, 255, 0.2],
              outline: { color: [0, 0, 255, 1], width: 2 },
            },
          });
          view.graphics.add(boxGraphic);

        } else if (event.action === "update" && dragOrigin) {
          const [x0, y0] = dragOrigin;
          const [x1, y1] = [event.x, event.y];
          const p1 = view.toMap({ x: x0, y: y0 });
          const p2 = view.toMap({ x: x1, y: y1 });
          const rings = [
            [Math.min(p1.x, p2.x), Math.min(p1.y, p2.y)],
            [Math.min(p1.x, p2.x), Math.max(p1.y, p2.y)],
            [Math.max(p1.x, p2.x), Math.max(p1.y, p2.y)],
            [Math.max(p1.x, p2.x), Math.min(p1.y, p2.y)],
            [Math.min(p1.x, p2.x), Math.min(p1.y, p2.y)],
          ];
          boxGraphic.geometry = {
            type: "polygon",
            rings: [rings],
            spatialReference: view.spatialReference,
          };

        } else if (event.action === "end" && dragOrigin) {
          view.graphics.remove(boxGraphic);
          boxGraphic = null;

          const [x0, y0] = dragOrigin;
          const [x1, y1] = [event.x, event.y];
          const p1 = view.toMap({ x: x0, y: y0 });
          const p2 = view.toMap({ x: x1, y: y1 });
          const queryExt = new Extent({
            xmin: Math.min(p1.x, p2.x),
            ymin: Math.min(p1.y, p2.y),
            xmax: Math.max(p1.x, p2.x),
            ymax: Math.max(p1.y, p2.y),
            spatialReference: view.spatialReference,
          });

          // Query y resaltar en cada capa visible
          let total = 0;
          for (let entry of layersRef.current) {
            const { layerView, visible, highlightHandle } = entry;
            if (visible && layerView) {
              try {
                const q = layerView.createQuery();
                q.geometry = queryExt;
                const result = await layerView.queryFeatures(q);
                const ids = result.features.map(f => f.attributes.OBJECTID);
                entry.selectedIds = ids;
                highlightHandle?.remove();
                entry.highlightHandle = ids.length
                  ? layerView.highlight(result.features)
                  : null;
                total += ids.length;
              } catch (err) {
                console.error("Error en box-selection:", err);
              }
            } else {
              entry.highlightHandle?.remove();
              entry.highlightHandle = null;
              entry.selectedIds = [];
            }
          }
          setSelectedCount(total);
          dragOrigin = null;
        }
      });

      // ——— CLICK MÚLTIPLE (Ctrl+Click o multiSelectMode) ———
      clickHandleRef.current = view.on("click", async (event) => {
        const wantsClick =
          (["web", "electron"].includes(platform) && event.native.ctrlKey) ||
          (["android", "ios"].includes(platform) && multiSelectModeRef.current);
        if (!wantsClick) return;

        const hit = await view.hitTest(event);
        if (!hit.results.length) return;
        const result = hit.results.find(r =>
          layersRef.current.some(e => e.layerView && r.graphic.layer === e.layer)
        );
        if (!result) return;

        const graphic = result.graphic;
        const entry = layersRef.current.find(e => e.layer === graphic.layer);
        if (!entry) return;

        const oid = graphic.getAttribute("OBJECTID");
        if (oid == null) return;

        const prevIds = entry.selectedIds || [];
        const newIds = prevIds.includes(oid)
          ? prevIds.filter(id => id !== oid)
          : [...prevIds, oid];

        entry.selectedIds = newIds;
        entry.highlightHandle?.remove();

        if (newIds.length) {
          try {
            const q = entry.layerView.createQuery();
            q.objectIds = newIds;
            q.returnGeometry = true;
            const resultSel = await entry.layerView.queryFeatures(q);
            if (resultSel.features.length) {
              entry.highlightHandle = entry.layerView.highlight(resultSel.features);
            }
          } catch (err) {
            console.error("Error en CTRL+click selection:", err);
          }
        }

        // Recalcular total
        let total = 0;
        for (let e of layersRef.current) {
          if (Array.isArray(e.selectedIds)) total += e.selectedIds.length;
        }
        setSelectedCount(total);
      });
    });

    // Cleanup al desmontar
    return () => {
      dragHandleRef.current?.remove();
      clickHandleRef.current?.remove();
      view.destroy();
    };
  }, []); // <-- vacío para inicializar solo una vez

  return (
    <>
      {platform === "android" && (
        <button
          onClick={() => setMultiSelectMode(!multiSelectMode)}
          style={{
            position: "absolute",
            right: 20,
            top: "220px", 
            zIndex: 1002,
            padding: "10px 15px",
            borderRadius: "20px",
            backgroundColor: multiSelectMode ? "#007AFF" : "#ccc",
            color: "white",
            border: "none",
            fontWeight: "bold",
            boxShadow: "0 2px 6px rgba(0,0,0,0.3)",
          }}
        >
          {multiSelectMode ? "Modo Normal" : "Multiselección"}
        </button>
      )}

      {/* Contenedor del mapa */}
      <div
        ref={mapDiv}
        style={{ width: "100%", height: "calc(100vh - 35px)" }}
      />
    </>
  );
};

export default MapViewWrapper;
