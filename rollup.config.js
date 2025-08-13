import resolve from 'rollup-plugin-node-resolve';
import commonjs from 'rollup-plugin-commonjs';

export default {
  input: 'node_modules/dbf/index.js',
  output: {
    file: 'public/libs/dbf.js',
    format: 'umd',
    name: 'dbf' // Esto hace que esté disponible como variable global "dbf"
  },
  plugins: [
    resolve(),
    commonjs()
  ]
};
