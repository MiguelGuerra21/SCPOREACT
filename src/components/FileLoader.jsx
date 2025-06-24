// src/components/FileLoader.jsx
import React from "react";

const FileLoader = React.forwardRef(({ accept, multiple, onFilesSelected }, ref) => {
  return (
    <input
      ref={ref}
      type="file"
      accept={accept}
      multiple={multiple}
      style={{ display: "none" }}
      onChange={(e) => {
        const files = e.target.files;
        if (files && files.length) {
          onFilesSelected(Array.from(files));
        }
        // reset para permitir seleccionar el mismo archivo otra vez si se desea
        e.target.value = null;
      }}
    />
  );
});

export default FileLoader;
