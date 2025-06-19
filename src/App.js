import React, { useEffect, useRef } from "react";
import MapView from "@arcgis/core/views/MapView";
import Map from "@arcgis/core/Map";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer";
import "@arcgis/core/assets/esri/themes/light/main.css";
import shp from "shpjs";

const App = () => {
  const mapDiv = useRef(null);
  const viewRef = useRef(null);

  useEffect(() => {
    if (!mapDiv.current) return;

    const map = new Map({ basemap: "streets-vector" });
    const view = new MapView({
      container: mapDiv.current,
      map,
      center: [-100, 40],
      zoom: 4,
    });
    viewRef.current = view;

    return () => view.destroy();
  }, []);

  const convertGeometry = (geo) => {
    const type = geo.type.toLowerCase();
    switch (type) {
      case "point":
        return { type: "point", x: geo.coordinates[0], y: geo.coordinates[1] };
      case "linestring":
        return { type: "polyline", paths: [geo.coordinates] };
      case "polygon":
        return { type: "polygon", rings: geo.coordinates };
      default:
        console.warn("Tipo no soportado:", type);
        return null;
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file || !viewRef.current) return;

    try {
      const arrayBuffer = await file.arrayBuffer();
      const geojson = await shp(arrayBuffer);

      const features = geojson.features.map((f, i) => {
        const geometry = convertGeometry(f.geometry);
        if (!geometry) return null;

        return {
          geometry,
          attributes: {
            OBJECTID: i,
            ...f.properties,
          },
        };
      }).filter(Boolean);

      if (features.length === 0) {
        console.warn("No valid features found in the shapefile");
        return;
      }

      const firstProps = geojson.features[0]?.properties || {};
      const dynamicFields = Object.keys(firstProps).map(key => ({
        name: key,
        alias: key,
        type: "string",
      }));

      const featureLayer = new FeatureLayer({
        source: features,
        objectIdField: "OBJECTID",
        geometryType: "polygon",
        spatialReference: { wkid: 4326 },
        fields: [
          { name: "OBJECTID", alias: "OBJECTID", type: "oid" },
          ...dynamicFields,
        ],
        renderer: {
          type: "simple",
          symbol: {
            type: "simple-fill",
            color: [0, 0, 255, 0.3],
            outline: { color: [0, 0, 255], width: 1 },
          },
        },
        popupTemplate: {
          title: "Atributos",
          content: [{
            type: "fields",
            fieldInfos: dynamicFields.map(f => ({ fieldName: f.name })),
          }],
        },
      });

      viewRef.current.map.removeAll();
      viewRef.current.map.add(featureLayer);

      await featureLayer.when();
      const extent = await featureLayer.queryExtent();
      
      if (extent && extent.extent) {
        await viewRef.current.goTo({
          target: extent.extent,
          padding: 50
        });
      } else {
        console.warn("Could not get valid extent from feature layer");
      }
    } catch (error) {
      console.error("Error processing shapefile:", error);
    }
  };

  return (
    <div>
      <input type="file" accept=".zip" onChange={handleFileChange} />
      <div style={{ height: "600px" }} ref={mapDiv}></div>
    </div>
  );
};

export default App;